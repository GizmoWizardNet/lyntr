import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, lyntImages, users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { lyntObj, hydratePolls, processAndUploadLyntImages, MAX_LYNT_IMAGES } from '../../util';
import { newFeed } from '../../feed/new';
import { followingFeed } from '../../feed/following';
import { mainFeed } from '../../feed/main';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { moderateContent, NSFW_ERROR } from '@/moderation';
import { sendMessage } from '@/sse';
import { awardPostCreated } from '@/server/lyntcoins';
import { minioClient } from '@/server/minio';

// GET /api/v2/lynts?type=New|Following|For you — unchanged from v1.
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

// POST /api/v2/lynts — create a lynt. New in v2: images are now accepted.
//
// Two request shapes are supported:
//   - application/json     { "content": "..." }                 — text only, same as v1.
//   - multipart/form-data   content=..., images=<file> (repeat)  — up to 4 images.
// Content-Type is what selects which parsing path runs; there's no separate
// "v2.1" for this, both have always been part of v2's POST /lynts.
export const POST: RequestHandler = async ({ request }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

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

	// Images can carry a post on their own — unlike v1, content isn't
	// required if at least one image is attached.
	if (!content && imageFiles.length === 0) {
		return json({ error: 'content or at least one image is required.' }, { status: 400 });
	}
	if (content.length > 280) {
		return json({ error: 'content must be 280 characters or fewer.' }, { status: 400 });
	}

	if (content) {
		const verdict = await moderateContent(content);
		if (!verdict.allowed) {
			return json({ error: verdict.reason }, { status: 400 });
		}
	}

	const snowflake = new Snowflake({
		custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime()
	});
	const lyntId = String(snowflake.getUniqueID());

	let pendingImageRows: { lynt_id: string; image_key: string; position: number }[] = [];
	if (imageFiles.length > 0) {
		try {
			pendingImageRows = await processAndUploadLyntImages(imageFiles, lyntId, minioClient);
		} catch (err) {
			if (err instanceof Error && err.message === 'NSFW') return NSFW_ERROR;
			throw err;
		}
	}

	const [newLynt] = await db
		.insert(lynts)
		.values({
			id: lyntId,
			user_id: auth.userId,
			content,
			has_link: content.includes('http'),
			has_image: pendingImageRows.length > 0
		})
		.returning();

	if (pendingImageRows.length > 0) {
		await db.insert(lyntImages).values(pendingImageRows);
	}

	sendMessage(lyntId);

	try {
		if (content) {
			await processMentions(content, auth.userId, lyntId);
			await processHashtags(content, lyntId);
		}
		await awardPostCreated(auth.userId, lyntId);
	} catch (e) {
		console.error('v2 lynt creation side-effects error:', e);
	}

	const [lynt] = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(eq(lynts.id, lyntId))
		.limit(1);

	return json(lynt, { status: 201 });
};
