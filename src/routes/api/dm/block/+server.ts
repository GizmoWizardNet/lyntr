import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { userBlocks, users } from '@/server/schema';
import { and, eq } from 'drizzle-orm';

// ── POST /api/dm/block ─────────────────────────────────────────────────────
// Body: { target_handle }. Blocks a user — they can no longer message you or
// send you a DM request, and you disappear from their ability to start one.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { target_handle } = await request.json() as { target_handle: string };
	if (!target_handle) return json({ error: 'Missing target_handle' }, { status: 400 });

	const [target] = await db.select({ id: users.id }).from(users)
		.where(eq(users.handle, target_handle.replace('@', ''))).limit(1);
	if (!target) return json({ error: 'User not found' }, { status: 404 });
	if (target.id === userId) return json({ error: "Can't block yourself" }, { status: 400 });

	await db.insert(userBlocks).values({ blocker_id: userId, blocked_id: target.id })
		.onConflictDoNothing();

	return json({ blocked: true });
};

// ── DELETE /api/dm/block ────────────────────────────────────────────────────
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { target_handle } = await request.json() as { target_handle: string };
	const [target] = await db.select({ id: users.id }).from(users)
		.where(eq(users.handle, target_handle.replace('@', ''))).limit(1);
	if (!target) return json({ error: 'User not found' }, { status: 404 });

	await db.delete(userBlocks).where(and(eq(userBlocks.blocker_id, userId), eq(userBlocks.blocked_id, target.id)));
	return json({ blocked: false });
};

// ── GET /api/dm/block ────────────────────────────────────────────────────────
// Lists everyone the current user has blocked.
export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const rows = await db.select({ id: users.id, username: users.username, handle: users.handle })
		.from(userBlocks)
		.innerJoin(users, eq(users.id, userBlocks.blocked_id))
		.where(eq(userBlocks.blocker_id, userId));

	return json(rows);
};
