import { db } from '@/server/db';
import { lynts, bookmarks, users } from '@/server/schema';
import { desc, and, eq, lt, gte } from 'drizzle-orm';
import { lyntObj } from '../util';

// See new.ts for why `before` exists — same missing-pagination bug here,
// cursoring on saved_at (this feed's own sort column).
export async function bookmarkedFeed(userId: string, before?: string | null, minIq?: number | null) {
	const feed = await db
		.select({
			...lyntObj(userId),
			savedAt: bookmarks.saved_at
		})
		.from(bookmarks)
		.innerJoin(lynts, eq(bookmarks.lynt_id, lynts.id))
		.innerJoin(users, eq(lynts.user_id, users.id))
		.where(and(
			eq(bookmarks.user_id, userId),
			before ? lt(bookmarks.saved_at, new Date(before)) : undefined,
			minIq !== undefined && minIq !== null ? gte(users.iq, minIq) : undefined
		))
		.orderBy(desc(bookmarks.saved_at))
		.limit(200);

	return feed;
}
