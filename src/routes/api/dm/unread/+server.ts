import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ count: 0 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ count: 0 }); }

	const result = await db.execute<{ count: number }>(sql`
		SELECT COUNT(*) as count
		FROM dm_messages m
		JOIN dm_conversations c ON c.id = m.conversation_id
		JOIN dm_members mem ON mem.conversation_id = c.id AND mem.user_id = ${userId} AND mem.left_at IS NULL AND mem.muted = false
		WHERE c.status = 'active'
		  AND m.sender_id != ${userId}
		  AND m.deleted_at IS NULL
		  AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
	`);

	return json({ count: Number(result[0]?.count ?? 0) });
};
