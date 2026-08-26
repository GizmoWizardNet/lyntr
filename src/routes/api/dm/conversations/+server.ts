import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { dmConversations, dmMembers, users } from '@/server/schema';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createNotification } from '@/server/notifications';
import { eitherBlocked } from '@/server/dm';
import { sendDmEvent } from '$lib/ws';

// ── GET /api/dm/conversations ─────────────────────────────────────────────
// Returns all conversations (1:1 and group) for the current user, with
// unread counts, mute/pin state, and a display name/avatar resolved for
// both cases.
export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const myMemberships = await db
		.select({
			conversation_id: dmMembers.conversation_id,
			muted: dmMembers.muted,
			pinned: dmMembers.pinned,
			last_read_message_id: dmMembers.last_read_message_id,
			last_read_at: dmMembers.last_read_at
		})
		.from(dmMembers)
		.where(and(eq(dmMembers.user_id, userId), isNull(dmMembers.left_at)));

	if (myMemberships.length === 0) return json([]);

	const convIds = myMemberships.map(m => m.conversation_id);
	const membershipMap = new Map(myMemberships.map(m => [m.conversation_id, m]));

	const convs = await db
		.select()
		.from(dmConversations)
		.where(inArray(dmConversations.id, convIds))
		.orderBy(desc(dmConversations.last_message_at));

	// All members of all these conversations, for group member lists and
	// for resolving the "other user" on 1:1s.
	const allMembers = await db
		.select({
			conversation_id: dmMembers.conversation_id,
			user_id: dmMembers.user_id,
			username: users.username,
			handle: users.handle,
			name_color: users.name_color,
			verified: users.verified
		})
		.from(dmMembers)
		.innerJoin(users, eq(users.id, dmMembers.user_id))
		.where(and(inArray(dmMembers.conversation_id, convIds), isNull(dmMembers.left_at)));

	const membersByConv = new Map<string, typeof allMembers>();
	for (const m of allMembers) {
		if (!membersByConv.has(m.conversation_id)) membersByConv.set(m.conversation_id, []);
		membersByConv.get(m.conversation_id)!.push(m);
	}

	// Unread counts per conversation, using each conversation's per-user
	// last_read_at from dm_members instead of the old dm_reads join.
	const unreadCounts = await db.execute<{ conversation_id: string; unread: number }>(sql`
		SELECT m.conversation_id, COUNT(*) as unread
		FROM dm_messages m
		JOIN dm_members mem ON mem.conversation_id = m.conversation_id AND mem.user_id = ${userId}
		WHERE m.conversation_id = ANY(ARRAY[${sql.raw(convIds.map(id => `'${id}'`).join(','))}]::uuid[])
		  AND m.sender_id != ${userId}
		  AND m.deleted_at IS NULL
		  AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
		GROUP BY m.conversation_id
	`);
	const unreadMap = new Map(unreadCounts.map(r => [r.conversation_id, Number(r.unread)]));

	const result = convs.map(c => {
		const membership = membershipMap.get(c.id)!;
		const members = (membersByConv.get(c.id) ?? []).filter(m => m.user_id !== userId);
		const otherUser = !c.is_group ? (membersByConv.get(c.id) ?? []).find(m => m.user_id !== userId) ?? null : null;

		return {
			id: c.id,
			status: c.status,
			is_group: c.is_group,
			name: c.name,
			icon_url: c.icon_url,
			owner_id: c.owner_id,
			last_message_at: c.last_message_at,
			last_message_preview: c.last_message_preview,
			created_at: c.created_at,
			muted: membership.muted,
			pinned: membership.pinned,
			unread: unreadMap.get(c.id) ?? 0,
			other_user: otherUser,
			members: c.is_group ? members : undefined
		};
	});

	// Pinned first, then by last activity (already sorted by last_message_at).
	result.sort((a, b) => (Number(b.pinned) - Number(a.pinned)));

	return json(result);
};

// ── POST /api/dm/conversations ────────────────────────────────────────────
// Body: { target_handle } for a 1:1 request/lookup, OR
//       { group: true, name?, member_handles: string[] } to create a group DM.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const body = await request.json() as {
		target_handle?: string;
		group?: boolean;
		name?: string;
		member_handles?: string[];
	};

	if (body.group) {
		const handles = (body.member_handles ?? []).map(h => h.replace('@', '')).filter(Boolean);
		if (handles.length < 2) {
			return json({ error: 'Group DMs need at least 2 other members' }, { status: 400 });
		}
		if (handles.length > 9) {
			return json({ error: 'Group DMs are limited to 10 members' }, { status: 400 });
		}

		const members = await db.select({ id: users.id, handle: users.handle })
			.from(users).where(inArray(users.handle, handles));
		if (members.length !== handles.length) {
			return json({ error: 'One or more users not found' }, { status: 404 });
		}
		for (const m of members) {
			if (await eitherBlocked(userId, m.id)) {
				return json({ error: `Can't add @${m.handle} — blocked` }, { status: 403 });
			}
		}

		const [conv] = await db.insert(dmConversations).values({
			is_group: true,
			status: 'active',
			name: body.name?.slice(0, 100) || null,
			owner_id: userId
		}).returning();

		const allMemberIds = [userId, ...members.map(m => m.id)];
		await db.insert(dmMembers).values(
			allMemberIds.map(uid => ({ conversation_id: conv.id, user_id: uid, role: uid === userId ? 'owner' : 'member' }))
		);

		for (const m of members) {
			sendDmEvent(m.id, { type: 'dm_group_added', conversation_id: conv.id });
		}

		return json({ conversation_id: conv.id, status: 'active', is_group: true }, { status: 201 });
	}

	// ── 1:1 DM request ──────────────────────────────────────────────────
	const targetHandle = body.target_handle;
	if (!targetHandle) return json({ error: 'Missing target_handle' }, { status: 400 });

	const [target] = await db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(eq(users.handle, targetHandle.replace('@', '')))
		.limit(1);

	if (!target) return json({ error: 'User not found' }, { status: 404 });
	if (target.id === userId) return json({ error: "Can't DM yourself" }, { status: 400 });
	if (await eitherBlocked(userId, target.id)) return json({ error: 'Unable to message this user' }, { status: 403 });

	// Look for an existing active/pending 1:1 (non-group) conversation shared
	// by both users via dm_members rather than the deprecated user_a/user_b pair.
	const shared = await db.execute<{ id: string; status: string }>(sql`
		SELECT c.id, c.status FROM dm_conversations c
		WHERE c.is_group = false
		  AND EXISTS (SELECT 1 FROM dm_members m1 WHERE m1.conversation_id = c.id AND m1.user_id = ${userId} AND m1.left_at IS NULL)
		  AND EXISTS (SELECT 1 FROM dm_members m2 WHERE m2.conversation_id = c.id AND m2.user_id = ${target.id} AND m2.left_at IS NULL)
		LIMIT 1
	`);

	if (shared.length > 0) {
		return json({ conversation_id: shared[0].id, status: shared[0].status, existing: true });
	}

	const [conv] = await db.insert(dmConversations).values({
		is_group: false,
		status: 'pending'
	}).returning();

	await db.insert(dmMembers).values([
		{ conversation_id: conv.id, user_id: userId, role: 'owner' },
		{ conversation_id: conv.id, user_id: target.id, role: 'member' }
	]);

	await createNotification(target.id, 'dm_request', userId);

	return json({ conversation_id: conv.id, status: 'pending', existing: false }, { status: 201 });
};
