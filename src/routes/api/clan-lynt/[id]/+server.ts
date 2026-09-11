import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { createClanDraft, ClanLyntError } from '@/server/clanLynt';
import { moderateContent } from '@/moderation';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { isValidLyntskinKey } from '$lib/lyntskins';
import { db } from '@/server/db';
import { userLyntskins } from '@/server/schema';
import { eq, and } from 'drizzle-orm';
 
// POST /api/clan-lynt — start a clan lynt relay.
// body: { content: string, memberIds: string[], gifUrl?, gifPreviewUrl? }
export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });
 
	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });
 
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid request body' }, { status: 400 });
 
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((x: unknown) => typeof x === 'string') : [];
 
	if (!content) return json({ error: 'Content cannot be empty' }, { status: 400 });
	if (content.length > 280) return json({ error: 'Content is too long' }, { status: 400 });
 
	const verdict = await moderateContent(content);
	if (!verdict.allowed) return json({ error: verdict.reason }, { status: 400 });

	let lyntskinKey: string | null = null;
	if (typeof body.lyntskinKey === 'string' && body.lyntskinKey) {
		if (!isValidLyntskinKey(body.lyntskinKey)) {
			return json({ error: 'Unknown lyntskin.' }, { status: 400 });
		}
		const [owns] = await db
			.select({ skin_key: userLyntskins.skin_key })
			.from(userLyntskins)
			.where(and(eq(userLyntskins.user_id, userId), eq(userLyntskins.skin_key, body.lyntskinKey)))
			.limit(1);
		if (!owns) return json({ error: "You don't own that lyntskin." }, { status: 403 });
		lyntskinKey = body.lyntskinKey;
	}

 	try {
		const clan = await createClanDraft(
			userId,
			content,
			memberIds,
			typeof body.gifUrl === 'string' ? body.gifUrl : null,
			typeof body.gifPreviewUrl === 'string' ? body.gifPreviewUrl : null,
			lyntskinKey
		);
		return json({ id: clan.id, status: 'pending' }, { status: 201 });
	} catch (e) {
		if (e instanceof ClanLyntError) return json({ error: e.message }, { status: e.status });
		console.error('Clan lynt creation error:', e);
		return json({ error: 'Failed to create clan lynt' }, { status: 500 });
	}
};