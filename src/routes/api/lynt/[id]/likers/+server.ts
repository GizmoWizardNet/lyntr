import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { likes, users } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/lynt/:id/likers
 *
 * Backs the hover dropdown on the like button (see LikersDropdown.svelte).
 * No auth required — who liked a public lynt isn't sensitive, same as the
 * count itself being public. Capped small and unpaginated on purpose: this
 * is a hover preview, not a full "liked by" page, so it only needs to answer
 * "roughly who, and is there more than fits."
 */
export const GET: RequestHandler = async ({ params }) => {
	const lyntId = params.id;
	if (!lyntId) return json({ error: 'Missing lynt ID' }, { status: 400 });

	const LIMIT = 8;

	try {
		const rows = await db
			.select({
				id: users.id,
				handle: users.handle,
				username: users.username,
				verified: users.verified,
				nameColor: users.name_color,
				likedAt: likes.liked_at
			})
			.from(likes)
			.innerJoin(users, eq(likes.user_id, users.id))
			.where(eq(likes.lynt_id, lyntId))
			.orderBy(desc(likes.liked_at))
			// Fetch one extra so we can tell the dropdown "there are more"
			// without a separate count query.
			.limit(LIMIT + 1);

		const likers = rows.slice(0, LIMIT).map(({ likedAt, ...u }) => u);

		return json({ likers, hasMore: rows.length > LIMIT });
	} catch (error) {
		console.error('Error fetching likers:', error);
		return json({ error: 'Failed to fetch likers' }, { status: 500 });
	}
};
