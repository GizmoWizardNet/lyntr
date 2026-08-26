import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { getLynt } from '@/server/lynt';
import { db } from '@/server/db';
import { lynts, users } from '@/server/schema';
import { eq, and } from 'drizzle-orm';
import { deleteLynt, lyntObj } from '../../../util';
import { moderateContent } from '@/moderation';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const lynt = await getLynt(params.id!, auth.userId);
	if (!lynt) return json({ error: 'Lynt not found' }, { status: 404 });

	return json(lynt);
};

// PUT /api/v2/lynts/:id — edit the text of a lynt you own. Mirrors the
// app's own edit rules: reposts can't be edited (they have no original
// text), content is re-moderated and re-scanned for @mentions/#hashtags
// exactly like an edit made through the app itself.
export const PUT: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const body = await request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content : '';

	if (!content || content.length > 280) {
		return json({ error: 'content is required and must be 1-280 characters.' }, { status: 400 });
	}

	const [lynt] = await db
		.select({ id: lynts.id, user_id: lynts.user_id, reposted: lynts.reposted })
		.from(lynts)
		.where(eq(lynts.id, params.id!))
		.limit(1);

	if (!lynt) return json({ error: 'Lynt not found' }, { status: 404 });
	if (lynt.user_id !== auth.userId) return json({ error: 'Unauthorized' }, { status: 403 });
	if (lynt.reposted) return json({ error: 'Reposts cannot be edited' }, { status: 400 });

	const verdict = await moderateContent(content);
	if (!verdict.allowed) {
		return json({ error: verdict.reason }, { status: 400 });
	}

	await db
		.update(lynts)
		.set({ content, has_link: content.includes('http'), edited_at: new Date() })
		.where(eq(lynts.id, params.id!));

	try {
		await processMentions(content, auth.userId, params.id!);
		await processHashtags(content, params.id!);
	} catch (err) {
		console.error('v2 lynt edit side-effects error:', err);
	}

	const [updated] = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(eq(lynts.id, params.id!))
		.limit(1);

	return json(updated);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const [owned] = await db
		.select({ id: lynts.id })
		.from(lynts)
		.where(and(eq(lynts.id, params.id!), eq(lynts.user_id, auth.userId)))
		.limit(1);

	if (!owned) return json({ error: 'Lynt not found' }, { status: 404 });

	await deleteLynt(params.id!);
	return json({ success: true });
};
