import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { lynts, lyntReactions } from '@/server/schema';
import { and, eq } from 'drizzle-orm';
import { broadcastReactionUpdate } from '$lib/ws';
import { normalRatelimit } from '@/server/ratelimit';

// Same small allow-list as DM reactions (see routes/api/dm/reactions) —
// keeps this a quick-react bar rather than a full emoji-picker surface.
const ALLOWED_EMOJI = new Set(['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉', '👀']);

// ── POST /api/reactions ─────────────────────────────────────────────────────
// Toggles a reaction on a lynt (top-level post or reply — both live in the
// `lynts` table). Unlike DM reactions, which broadcast a per-user delta to
// a small fixed set of conversation members, a lynt can be watched by an
// unbounded number of open tabs (anyone in its watch_lynt room, plus
// anyone with it in their feed). Rather than fan out per-user deltas here,
// we recompute the full tally for this lynt and broadcast that — same
// "server broadcast is truth" pattern as broadcastPollUpdate.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try {
		userId = (await verifyAuthJWT(token)).userId;
		if (!userId) throw new Error('invalid');
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Reactions are a quick-click, low-stakes interaction like a like toggle
	// — not a content-creation action — so this uses the same normalRatelimit
	// as /api/likelynt (5 req/5s by default) rather than sensitiveRatelimit
	// (3 req/10s, meant for posting/editing/uploads). The stricter limit was
	// tripping immediately on normal rapid-react usage.
	const { success } = await normalRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	let body: { lynt_id?: string; emoji?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const { lynt_id, emoji } = body;
	if (!lynt_id || !emoji || !ALLOWED_EMOJI.has(emoji)) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	const [lynt] = await db.select({ id: lynts.id }).from(lynts).where(eq(lynts.id, lynt_id)).limit(1);
	if (!lynt) return json({ error: 'Not found' }, { status: 404 });

	const [existing] = await db
		.select({ id: lyntReactions.id })
		.from(lyntReactions)
		.where(and(eq(lyntReactions.lynt_id, lynt_id), eq(lyntReactions.user_id, userId), eq(lyntReactions.emoji, emoji)))
		.limit(1);

	let action: 'added' | 'removed';
	if (existing) {
		await db.delete(lyntReactions).where(eq(lyntReactions.id, existing.id));
		action = 'removed';
	} else {
		await db.insert(lyntReactions).values({ lynt_id, user_id: userId, emoji });
		action = 'added';
	}

	const rows = await db
		.select({ emoji: lyntReactions.emoji, user_id: lyntReactions.user_id })
		.from(lyntReactions)
		.where(eq(lyntReactions.lynt_id, lynt_id));

	const byEmoji = new Map<string, string[]>();
	for (const row of rows) {
		if (!byEmoji.has(row.emoji)) byEmoji.set(row.emoji, []);
		byEmoji.get(row.emoji)!.push(row.user_id);
	}
	const reactions = Array.from(byEmoji.entries()).map(([e, userIds]) => ({
		emoji: e,
		count: userIds.length,
		userIds
	}));

	broadcastReactionUpdate(lynt_id, reactions);

	return json({ action, reactions });
};
