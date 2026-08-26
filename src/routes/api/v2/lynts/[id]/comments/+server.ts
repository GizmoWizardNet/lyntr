import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, likes, users, lyntImages } from '@/server/schema';
import { and, desc, eq } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { lyntObj, hydratePolls, processAndUploadLyntImages, MAX_LYNT_IMAGES } from '../../../../util';
import { createNotification } from '@/server/notifications';
import { notifyLyntEngagement } from '@/server/clanLynt';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { moderateContent, NSFW_ERROR } from '@/moderation';
import { sendToUser } from '$lib/sse';
import { awardReplyReceived } from '@/server/lyntcoins';
import { minioClient } from '@/server/minio';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const parentId = params.id!;

	const comments = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(likes, eq(likes.lynt_id, lynts.id))
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(and(eq(lynts.parent, parentId), eq(lynts.reposted, false)))
		.groupBy(lynts.id, users.id)
		.orderBy(desc(lynts.created_at))
		.limit(50);

	return json({ comments: hydratePolls(comments) });
};

// POST /api/v2/lynts/:id/comments — reply to a lynt. New in v2: images are
// now accepted, same content-type-driven dual path as POST /v2/lynts.
export const POST: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const parentId = params.id!;

	const contentType = request.headers.get('content-type') ?? '';
	let content = '';
	let imageFiles: File[] = [];

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		content = typeof formData.get('content') === 'string' ? (formData.get('content') as string) : '';
		imageFiles = formData.getAll('images').filter((f): f is File => f instanceof File).slice(0, MAX_LYNT_IMAGES);
	} else {
		const body = await request.json().catch(() => null);
		content = typeof body?.content === 'string' ? body.content : '';
	}

	if (!content && imageFiles.length === 0) {
		return json({ error: 'content or at least one image is required.' }, { status: 400 });
	}
	if (content.length > 280) {
		return json({ error: 'content must be 280 characters or fewer.' }, { status: 400 });
	}

	const [parentLynt] = await db
		.select({ id: lynts.id, userId: lynts.user_id, content: lynts.content, isClan: lynts.is_clan })
		.from(lynts)
		.where(eq(lynts.id, parentId))
		.limit(1);

	if (!parentLynt) return json({ error: 'Lynt not found' }, { status: 404 });

	if (content) {
		const verdict = await moderateContent(content);
		if (!verdict.allowed) {
			return json({ error: verdict.reason }, { status: 400 });
		}
	}

	const snowflake = new Snowflake({ custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime() });
	const commentId = String(snowflake.getUniqueID());

	let pendingImageRows: { lynt_id: string; image_key: string; position: number }[] = [];
	if (imageFiles.length > 0) {
		try {
			pendingImageRows = await processAndUploadLyntImages(imageFiles, commentId, minioClient);
		} catch (err) {
			if (err instanceof Error && err.message === 'NSFW') return NSFW_ERROR;
			throw err;
		}
	}

	await db.insert(lynts).values({
		id: commentId,
		user_id: auth.userId,
		content,
		has_link: content.includes('http'),
		has_image: pendingImageRows.length > 0,
		parent: parentId
	});

	if (pendingImageRows.length > 0) {
		await db.insert(lyntImages).values(pendingImageRows);
	}

	const [newComment] = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(likes, eq(likes.lynt_id, lynts.id))
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(eq(lynts.id, commentId))
		.limit(1);

	try {
		if (parentLynt.userId && parentLynt.userId !== auth.userId) {
			await notifyLyntEngagement(parentId, parentLynt.userId, parentLynt.isClan, 'comment', auth.userId, commentId, {
				lyntContent: content
			});
			sendToUser(parentLynt.userId, { type: 'new_comment', lyntId: parentId, comment: newComment });
			await awardReplyReceived(parentLynt.userId, auth.userId, parentId);
		}
		sendToUser(auth.userId, { type: 'new_comment', lyntId: parentId, comment: newComment });
		if (content) {
			await processMentions(content, auth.userId, commentId);
			await processHashtags(content, commentId);
		}
	} catch (e) {
		console.error('v2 comment side-effects error:', e);
	}

	return json(newComment, { status: 201 });
};
