import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { getFriendIds } from '@/server/clanLynt';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { inArray } from 'drizzle-orm';

// GET /api/friends — mutual follows only. Used by the Clan Lynt composer's
// member picker, which can only ever add friends, not one-way follows.
export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	const friendIds = [...(await getFriendIds(userId))];
	if (friendIds.length === 0) return json([]);

	const friends = await db
		.select({
			id: users.id,
			username: users.username,
			handle: users.handle,
			iq: users.iq,
			verified: users.verified,
			nameColor: users.name_color
		})
		.from(users)
		.where(inArray(users.id, friendIds));

	return json(friends);
};
