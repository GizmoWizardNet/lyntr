import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { dmConversations, dmMembers, users } from '@/server/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getMembership, getConversation, getActiveMembers, eitherBlocked } from '@/server/dm';
import { sendDmEvent, broadcastDmToMembers } from '$lib/ws';

// ── POST /api/dm/members ───────────────────────────────────────────────────
// Add one or more members to an existing group DM. Any current member can add.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { conversation_id, handles } = await request.json() as { conversation_id: string; handles: string[] };
	if (!conversation_id || !handles?.length) return json({ error: 'Invalid request' }, { status: 400 });

	const membership = await getMembership(conversation_id, userId);
	if (!membership) return json({ error: 'Not found' }, { status: 404 });
	const conv = await getConversation(conversation_id);
	if (!conv?.is_group) return json({ error: 'Not a group DM' }, { status: 400 });

	const currentMembers = await getActiveMembers(conversation_id);
	if (currentMembers.length + handles.length > 10) {
		return json({ error: 'Group DMs are limited to 10 members' }, { status: 400 });
	}

	const cleanHandles = handles.map(h => h.replace('@', ''));
	const newUsers = await db.select({ id: users.id, handle: users.handle })
		.from(users).where(inArray(users.handle, cleanHandles));
	if (newUsers.length !== cleanHandles.length) return json({ error: 'One or more users not found' }, { status: 404 });

	const existingIds = new Set(currentMembers.map(m => m.user_id));
	const toAdd = newUsers.filter(u => !existingIds.has(u.id));

	for (const u of toAdd) {
		if (await eitherBlocked(userId, u.id)) {
			return json({ error: `Can't add @${u.handle} — blocked` }, { status: 403 });
		}
	}

	if (toAdd.length > 0) {
		await db.insert(dmMembers).values(
			toAdd.map(u => ({ conversation_id, user_id: u.id, role: 'member' }))
		).onConflictDoUpdate({
			target: [dmMembers.conversation_id, dmMembers.user_id],
			set: { left_at: null, joined_at: new Date() }
		});
	}

	const allMemberIds = [...currentMembers.map(m => m.user_id), ...toAdd.map(u => u.id)];
	for (const u of toAdd) sendDmEvent(u.id, { type: 'dm_group_added', conversation_id });
	broadcastDmToMembers(allMemberIds, { type: 'dm_members_updated', conversation_id }, undefined);

	return json({ added: toAdd.map(u => u.handle) });
};

// ── DELETE /api/dm/members ─────────────────────────────────────────────────
// Body: { conversation_id, target_user_id? }
// Without target_user_id: you leave the group.
// With target_user_id: only the owner can remove someone else.
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { conversation_id, target_user_id } = await request.json() as { conversation_id: string; target_user_id?: string };
	if (!conversation_id) return json({ error: 'Missing conversation_id' }, { status: 400 });

	const membership = await getMembership(conversation_id, userId);
	if (!membership) return json({ error: 'Not found' }, { status: 404 });
	const conv = await getConversation(conversation_id);
	if (!conv?.is_group) return json({ error: 'Not a group DM' }, { status: 400 });

	const removingSelf = !target_user_id || target_user_id === userId;
	if (!removingSelf && membership.role !== 'owner') {
		return json({ error: 'Only the group owner can remove members' }, { status: 403 });
	}

	const removedId = removingSelf ? userId : target_user_id!;
	const members = await getActiveMembers(conversation_id);

	await db.update(dmMembers)
		.set({ left_at: new Date() })
		.where(and(eq(dmMembers.conversation_id, conversation_id), eq(dmMembers.user_id, removedId)));

	broadcastDmToMembers(
		members.map(m => m.user_id),
		{ type: removingSelf ? 'dm_member_left' : 'dm_member_removed', conversation_id, user_id: removedId }
	);

	return json({ removed: removedId });
};

// ── PATCH /api/dm/members ──────────────────────────────────────────────────
// Rename the group or change its icon (owner only).
export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { conversation_id, name, muted, pinned } = await request.json() as {
		conversation_id: string; name?: string; muted?: boolean; pinned?: boolean;
	};
	if (!conversation_id) return json({ error: 'Missing conversation_id' }, { status: 400 });

	const membership = await getMembership(conversation_id, userId);
	if (!membership) return json({ error: 'Not found' }, { status: 404 });

	// mute/pin are per-member preferences — anyone can set their own.
	if (muted !== undefined || pinned !== undefined) {
		await db.update(dmMembers)
			.set({ ...(muted !== undefined ? { muted } : {}), ...(pinned !== undefined ? { pinned } : {}) })
			.where(and(eq(dmMembers.conversation_id, conversation_id), eq(dmMembers.user_id, userId)));
	}

	// Renaming the group is owner-only and broadcasts to everyone.
	if (name !== undefined) {
		if (membership.role !== 'owner') return json({ error: 'Only the group owner can rename it' }, { status: 403 });
		await db.update(dmConversations).set({ name: name.slice(0, 100) }).where(eq(dmConversations.id, conversation_id));
		const members = await getActiveMembers(conversation_id);
		broadcastDmToMembers(members.map(m => m.user_id), { type: 'dm_group_renamed', conversation_id, name }, userId);
	}

	return json({ ok: true });
};
