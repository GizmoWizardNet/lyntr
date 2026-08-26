import { db } from '@/server/db';
import { lynts, likes, users, history } from '@/server/schema';
import { desc, and, eq, not, exists, or, isNull, lt, gte } from 'drizzle-orm';
import { lyntObj } from '../util';

// `before`: an ISO timestamp cursor. Previously this had no pagination
// at all — every "load more" call re-ran the exact same top-50 query, so
// infinite scroll on the New tab silently did nothing past the first
// page (the client-side de-dupe against already-loaded ids was quietly
// papering over that). Passing the created_at of the oldest lynt already
// loaded lets each page pick up exactly where the last one left off.
//
// `minIq`: filters to lynts whose AUTHOR currently has at least that
// IQ — same "filter by IQ level" control the scrollables feed shares.
export async function newFeed(userId: string | null, before?: string | null, minIq?: number | null) {
	const feed = await db
		.select(lyntObj(userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(
			and(
				or(isNull(lynts.parent), eq(lynts.reposted, true)),
				before ? lt(lynts.created_at, new Date(before)) : undefined,
				minIq !== undefined && minIq !== null ? gte(users.iq, minIq) : undefined
			)
		)
		.orderBy(desc(lynts.created_at))
		.limit(50);

	return feed;
}
