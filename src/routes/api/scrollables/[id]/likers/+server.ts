import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { scrollableLikes, users } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/scrollables/:id/likers
 *
 * Same shape and reasoning as /api/lynt/:id/likers — see that file for the
 * full rationale (public, unpaginated, capped small; this is a hover
 * preview, not a "liked by" page).
 */
export const GET: RequestHandler = async ({ params }) => {
	const scrollableId = params.id;
	if (!scrollableId) return json({ error: 'Missing scrollable ID' }, { status: 400 });

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
