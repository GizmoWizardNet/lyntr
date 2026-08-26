import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { lynts, likes, users, lyntImages } from '@/server/schema';
import { and, desc, eq } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { notifyLyntEngagement } from '@/server/clanLynt';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { lyntObj, hydratePolls, processAndUploadLyntImages, MAX_LYNT_IMAGES } from '../util';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { moderateContent, NSFW_ERROR } from '@/moderation';
import { minioClient } from '@/server/minio';
import { sendToUser, broadcastNewLynt } from '$lib/sse';
import { awardReplyReceived } from '@/server/lyntcoins';

// GET /api/comments?id=<parentLyntId> — this was missing entirely, which is
// why MainPage's getComments() was getting a 405: the route only had a POST
// handler. Mirrors the v2 GET /lynts/:id/comments logic (same lyntObj shape,
// same ordering), but returns a bare array since that's what the frontend's
// getComments() expects (`res.map(...)` on the raw response).
export const GET: RequestHandler = async ({ url, cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return json({ error: 'Missing authentication' }, { status: 401 });

	let userId: string;
	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		userId = jwtPayload.userId;
		if (!userId) throw new Error('Invalid JWT token');
	} catch {
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	const parentId = url.searchParams.get('id');
	if (!parentId) return json({ error: 'Missing lynt id' }, { status: 400 });

	const comments = await db
		.select(lyntObj(userId))
		.from(lynts)
		.leftJoin(likes, eq(likes.lynt_id, lynts.id))
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(and(eq(lynts.parent, parentId), eq(lynts.reposted, false)))
		.groupBy(lynts.id, users.id)
		.orderBy(desc(lynts.created_at))
		.limit(50);

	return json(hydratePolls(comments));
};

// Replies now go through the same multipart contract as top-level lynts
// (images + GIF), so the reply composer can be the same component as the
// main one instead of a stripped-down text box. Polls are intentionally
// left out of replies — a poll-on-a-reply is an unusual enough pattern
// that it's not worth the extra UI/validation surface right now.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return json({ error: 'Missing authentication' }, { status: 401 });

	let userId: string;
	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		userId = jwtPayload.userId;
		if (!userId) throw new Error('Invalid JWT token');
	} catch {
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const formData = await request.formData();
	const id = formData.get('id') as string;
	let content = (formData.get('content') as string) || '';
	const imageFiles = formData.getAll('images').filter((f): f is File => f instanceof File).slice(0, MAX_LYNT_IMAGES);
	const gifUrl = formData.get('gif_url') as string | null;
	const gifPreviewUrl = formData.get('gif_preview_url') as string | null;

	if (!id) return json({ error: 'Missing parent lynt id' }, { status: 400 });
	if (content.length > 280) return json({ error: 'Invalid content' }, { status: 400 });
	if (!content && imageFiles.length === 0 && !gifUrl) {
		return json({ error: 'Reply is empty' }, { status: 400 });
	}
	if (imageFiles.length > 0 && gifUrl) {
		return json({ error: 'Choose either images or a GIF, not both' }, { status: 400 });
	}
	if (gifUrl && (!gifUrl.startsWith('https://') || !gifPreviewUrl?.startsWith('https://'))) {
		return json({ error: 'Invalid GIF URL' }, { status: 400 });
	}

	const verdict = await moderateContent(content);
	if (!verdict.allowed) {
		return json({ error: verdict.reason }, { status: 400 });
	}

	try {
		const lyntId = new Snowflake({ custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime() });
		const uniqueLyntId = String(lyntId.getUniqueID());

		const [existingLynt] = await db
			.select({ id: lynts.id, userId: lynts.user_id, content: lynts.content, isClan: lynts.is_clan })
			.from(lynts)
			.where(eq(lynts.id, id))
			.limit(1);

		if (!existingLynt) return json({ error: 'Invalid lynt ID' }, { status: 400 });

		const lyntValues: any = {
			id: uniqueLyntId,
			user_id: userId,
			content,
			has_link: content.includes('http'),
			parent: id
		};

		let pendingImageRows: { lynt_id: string; image_key: string; position: number }[] = [];
		if (imageFiles.length > 0) {
			try {
				pendingImageRows = await processAndUploadLyntImages(imageFiles, uniqueLyntId, minioClient);
			} catch (err) {
				if (err instanceof Error && err.message === 'NSFW') return NSFW_ERROR;
				throw err;
			}
			lyntValues.has_image = true;
		}

		if (gifUrl) {
			lyntValues.gif_url = gifUrl;
			lyntValues.gif_preview_url = gifPreviewUrl || gifUrl;
		}

		await db.insert(lynts).values(lyntValues);

		if (pendingImageRows.length > 0) {
			await db.insert(lyntImages).values(pendingImageRows);
		}

		const [newLynt] = await db
			.select(lyntObj(userId))
			.from(lynts)
			.leftJoin(likes, eq(likes.lynt_id, lynts.id))
			.leftJoin(users, eq(lynts.user_id, users.id))
			.where(eq(lynts.id, uniqueLyntId))
			.limit(1);

		if (existingLynt.userId && existingLynt.userId !== userId) {
			await notifyLyntEngagement(id, existingLynt.userId, existingLynt.isClan, 'comment', userId, uniqueLyntId, {
				lyntContent: content
			});
			// Push live notification to the lynt author
			sendToUser(existingLynt.userId, {
				type: 'new_comment',
				lyntId: id,       // the parent lynt
				comment: newLynt  // the full comment object
			});

			try {
				await awardReplyReceived(existingLynt.userId, userId, id);
			} catch (lcError) {
				console.error('LyntCoins award error (reply):', lcError);
			}
		}

		// Commenter gets it too so their own panel updates instantly
		sendToUser(userId, {
			type: 'new_comment',
			lyntId: id,
			comment: newLynt
		});

		// @mentions in the comment text — fires after the row exists so the
		// notification's lyntId points at a row that's actually queryable.
		if (content) {
			await processMentions(content, userId, uniqueLyntId);
			await processHashtags(content, uniqueLyntId);
		}

		return json(newLynt, { status: 201 });
	} catch (error) {
		console.error('Error creating comment:', error);
		return json({ error: 'Failed to create lynt' }, { status: 500 });
	}
};
