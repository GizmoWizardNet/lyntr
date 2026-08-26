import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { dmConversations } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '@/server/notifications';
import { sendDmEvent } from '$lib/ws';
import { getMembership, getConversation, getActiveMembers } from '@/server/dm';

// POST /api/dm/request — accept or reject a pending 1:1 DM request
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { conversation_id, action } = await request.json() as {
		conversation_id: string;
		action: 'accept' | 'reject';
	};

	if (!conversation_id || !['accept', 'reject'].includes(action)) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	const membership = await getMembership(conversation_id, userId);
	if (!membership) return json({ error: 'Conversation not found' }, { status: 404 });
	const conv = await getConversation(conversation_id);
	if (!conv) return json({ error: 'Conversation not found' }, { status: 404 });
	if (conv.status !== 'pending') return json({ error: 'Request already resolved' }, { status: 409 });

	const newStatus = action === 'accept' ? 'active' : 'rejected';
	await db.update(dmConversations).set({ status: newStatus }).where(eq(dmConversations.id, conversation_id));

	const members = await getActiveMembers(conversation_id);
	const otherUserId = members.find(m => m.user_id !== userId)?.user_id;

	if (action === 'accept' && otherUserId) {
		await createNotification(otherUserId, 'dm_accepted', userId);
		sendDmEvent(otherUserId, { type: 'dm_accepted', conversation_id });
	}

	return json({ status: newStatus });
};
