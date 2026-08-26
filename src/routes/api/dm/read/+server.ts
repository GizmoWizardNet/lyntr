import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { dmMembers } from '@/server/schema';
import { and, eq } from 'drizzle-orm';
import { getActiveMembers } from '@/server/dm';
import { broadcastDmToMembers } from '$lib/ws';

// POST /api/dm/read — mark conversation as read up to a given message.
// Also tells other members so they can show "seen" in group DMs.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { conversation_id, message_id } = await request.json() as {
		conversation_id: string;
		message_id: string;
	};
	if (!conversation_id || !message_id) return json({ error: 'Invalid request' }, { status: 400 });

	await db.update(dmMembers)
		.set({ last_read_message_id: message_id, last_read_at: new Date() })
		.where(and(eq(dmMembers.conversation_id, conversation_id), eq(dmMembers.user_id, userId)));

	const members = await getActiveMembers(conversation_id);
	broadcastDmToMembers(
		members.map(m => m.user_id),
		{ type: 'dm_read_receipt', conversation_id, user_id: userId, message_id },
		userId
	);

	return json({ ok: true });
};
