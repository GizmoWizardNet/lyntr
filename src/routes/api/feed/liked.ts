import { db } from '@/server/db';
import { lynts, likes, users } from '@/server/schema';
import { desc, and, eq, exists, or, isNull, lt, gte } from 'drizzle-orm';
import { lyntObj } from '../util';

// See new.ts for why `before` exists — same missing-pagination bug here,
// cursoring on liked_at (this feed's own sort column) rather than
// created_at, since a lynt can be liked long after it was posted.
export async function likedFeed(userId: string, before?: string | null, minIq?: number | null) {
	const feed = await db
		.select({
			...lyntObj(userId),
			likedAt: likes.liked_at
		})
		.from(likes)
		.innerJoin(lynts, eq(likes.lynt_id, lynts.id))
		.innerJoin(users, eq(lynts.user_id, users.id))
		.where(and(
			eq(likes.user_id, userId),
			before ? lt(likes.liked_at, new Date(before)) : undefined,
			minIq !== undefined && minIq !== null ? gte(users.iq, minIq) : undefined
		))
		.orderBy(desc(likes.liked_at))
		.limit(100);

	return feed;
}
