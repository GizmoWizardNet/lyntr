import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { scrollableLikes, users } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';


export const GET: RequestHandler = async ({ request, params }) => {
    const auth = await authenticateApiRequest(request);
    if (isApiAuthResponse(auth)) return auth;

	const scrollableId = params.id!;

	const LIMIT = 8;

	try {
		const rows = await db
			.select({
				id: users.id,
				handle: users.handle,
				username: users.username,
				verified: users.verified,
				nameColor: users.name_color,
				likedAt: scrollableLikes.liked_at
			})
			.from(scrollableLikes)
			.innerJoin(users, eq(scrollableLikes.user_id, users.id))
			.where(eq(scrollableLikes.scrollable_id, scrollableId))
			.orderBy(desc(scrollableLikes.liked_at))
			.limit(LIMIT + 1);

		const likers = rows.slice(0, LIMIT).map(({ likedAt, ...u }) => u);

		return json({ likers, hasMore: rows.length > LIMIT });
	} catch (error) {
		console.error('Error fetching scrollable likers:', error);
		return json({ error: 'Failed to fetch likers' }, { status: 500 });
	}
};
