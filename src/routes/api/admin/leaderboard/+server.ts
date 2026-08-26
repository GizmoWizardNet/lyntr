import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { users, followers } from '@/server/schema';
import { sql, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('Authorization') !== process.env.ADMIN_KEY)
		return json({ error: 'Unauthorized' }, { status: 401 });

	const by = url.searchParams.get('by') || 'followers';

	if (by === 'iq') {
		const top = await db
			.select({ id: users.id, handle: users.handle, username: users.username, iq: users.iq })
			.from(users)
			.orderBy(desc(users.iq))
			.limit(10);
		return json({ users: top });
	}

	// followers
	const top = await db
		.select({
			id: users.id,
			handle: users.handle,
			username: users.username,
			followers: sql<number>`(select count(*) from ${followers} where user_id = ${users.id})`.as('followers')
		})
		.from(users)
		.orderBy(sql`followers desc`)
		.limit(10);

	return json({ users: top });
};
