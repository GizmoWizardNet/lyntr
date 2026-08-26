import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { lyntObj, hydratePolls } from '../../util';
import { newFeed } from '../../feed/new';
import { followingFeed } from '../../feed/following';
import { mainFeed } from '../../feed/main';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { moderateContent } from '@/moderation';
import { sendMessage } from '@/sse';
import { awardPostCreated } from '@/server/lyntcoins';

// GET /api/v1/lynts?type=New|Following|For you  — a feed page.
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const type = url.searchParams.get('type') || 'New';
	const tabs = ['For you', 'Following', 'New'];
	if (!tabs.includes(type)) {
		return json({ error: `Invalid type. Must be one of: ${tabs.join(', ')}` }, { status: 400 });
	}

	let result;
	if (type === 'Following') result = await followingFeed(auth.userId);
	else if (type === 'For you') result = await mainFeed(auth.userId);
	else result = await newFeed(auth.userId);

	return json({ lynts: hydratePolls(result) });
};

// POST /api/v1/lynts — create a text lynt.
// Note: image/GIF/poll attachments aren't supported over the API yet —
// only plain text content, up to 280 characters, same as the app.
export const POST: RequestHandler = async ({ request }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content : '';

	if (!content || content.length > 280) {
		return json({ error: 'content is required and must be 1-280 characters.' }, { status: 400 });
	}

	const verdict = await moderateContent(content);
	if (!verdict.allowed) {
		return json({ error: verdict.reason }, { status: 400 });
	}

	const snowflake = new Snowflake({
		custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime()
	});
	const lyntId = String(snowflake.getUniqueID());

	const [newLynt] = await db
		.insert(lynts)
		.values({
			id: lyntId,
			user_id: auth.userId,
			content,
			has_link: content.includes('http')
		})
		.returning();

	sendMessage(lyntId);

	try {
		await processMentions(content, auth.userId, lyntId);
		await processHashtags(content, lyntId);
		await awardPostCreated(auth.userId, lyntId);
	} catch (e) {
		console.error('v1 lynt creation side-effects error:', e);
	}

	const [lynt] = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(eq(lynts.id, lyntId))
		.limit(1);

	return json(lynt, { status: 201 });
};
