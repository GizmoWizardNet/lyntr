import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { dmMessages, dmReactions } from '@/server/schema';
import { and, eq } from 'drizzle-orm';
import { getMembership, getActiveMembers } from '@/server/dm';
import { broadcastDmToMembers } from '$lib/ws';

// A small allow-list keeps this a lightweight reaction bar rather than a
// full emoji-picker surface — matches what most daily-driver chat apps
// default to (quick-react on hover) with room to grow later.
const ALLOWED_EMOJI = new Set(['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉', '👀']);

// ── POST /api/dm/reactions ─────────────────────────────────────────────────
// Toggles a reaction: adds it if the user hasn't reacted with that emoji on
// this message yet, removes it if they have.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { message_id, emoji } = await request.json() as { message_id: string; emoji: string };
	if (!message_id || !ALLOWED_EMOJI.has(emoji)) return json({ error: 'Invalid request' }, { status: 400 });

	const [msg] = await db.select({ id: dmMessages.id, conversation_id: dmMessages.conversation_id })
		.from(dmMessages).where(eq(dmMessages.id, message_id)).limit(1);
	if (!msg) return json({ error: 'Not found' }, { status: 404 });

	const membership = await getMembership(msg.conversation_id, userId);
	if (!membership) return json({ error: 'Not found' }, { status: 404 });

	const [existing] = await db.select().from(dmReactions)
		.where(and(eq(dmReactions.message_id, message_id), eq(dmReactions.user_id, userId), eq(dmReactions.emoji, emoji)))
		.limit(1);

	let action: 'added' | 'removed';
	if (existing) {
		await db.delete(dmReactions).where(eq(dmReactions.id, existing.id));
		action = 'removed';
	} else {
		await db.insert(dmReactions).values({ message_id, user_id: userId, emoji });
		action = 'added';
	}

	// excludeUserId: the actor's client already applied this reaction
	// optimistically (see toggleReaction in DMConversation.svelte). Without
	// excluding them here, their own echo of this broadcast re-applies the
	// same +1/-1 delta on top of the optimistic one, silently double-counting
	// their own reactions (and for group DMs, only for the reacting member —
	// everyone else was already fine since they only ever apply it once).
	const members = await getActiveMembers(msg.conversation_id);
	broadcastDmToMembers(
		members.map(m => m.user_id),
		{ type: 'dm_reaction_update', conversation_id: msg.conversation_id, message_id, emoji, user_id: userId, action },
		userId
	);

	return json({ action });
};
