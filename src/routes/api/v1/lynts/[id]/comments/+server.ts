import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, likes, users } from '@/server/schema';
import { and, desc, eq } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { lyntObj, hydratePolls } from '../../../../util';
import { createNotification } from '@/server/notifications';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { moderateContent } from '@/moderation';
import { sendToUser } from '$lib/sse';
import { awardReplyReceived } from '@/server/lyntcoins';

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

export const POST: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const parentId = params.id!;
	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content : '';

	if (!content || content.length > 280) {
		return json({ error: 'content is required and must be 1-280 characters.' }, { status: 400 });
	}

	const [parentLynt] = await db
		.select({ id: lynts.id, userId: lynts.user_id })
		.from(lynts)
		.where(eq(lynts.id, parentId))
		.limit(1);

	if (!parentLynt) return json({ error: 'Lynt not found' }, { status: 404 });

	const verdict = await moderateContent(content);
	if (!verdict.allowed) {
		return json({ error: verdict.reason }, { status: 400 });
	}

	const snowflake = new Snowflake({ custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime() });
	const commentId = String(snowflake.getUniqueID());

	await db.insert(lynts).values({
		id: commentId,
		user_id: auth.userId,
		content,
		has_link: content.includes('http'),
		parent: parentId
	});

	const [newComment] = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(likes, eq(likes.lynt_id, lynts.id))
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(eq(lynts.id, commentId))
		.limit(1);

	try {
		if (parentLynt.userId && parentLynt.userId !== auth.userId) {
			await createNotification(parentLynt.userId, 'comment', auth.userId, commentId);
			sendToUser(parentLynt.userId, { type: 'new_comment', lyntId: parentId, comment: newComment });
			await awardReplyReceived(parentLynt.userId, auth.userId, parentId);
		}
		sendToUser(auth.userId, { type: 'new_comment', lyntId: parentId, comment: newComment });
		await processMentions(content, auth.userId, commentId);
		await processHashtags(content, commentId);
	} catch (e) {
		console.error('v1 comment side-effects error:', e);
	}

	return json(newComment, { status: 201 });
};
