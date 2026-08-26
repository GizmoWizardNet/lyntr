// handle.ts
import { db } from '@/server/db';
import { lynts, users } from '@/server/schema';
import { sql, desc, and, eq, or, isNull, lt, gte } from 'drizzle-orm';
import { lyntObj } from '../util';

// See new.ts for why `before` exists — same missing-pagination bug here.
export async function handleFeed(handleUserId: string, userId: string, before?: string | null, minIq?: number | null) {
	// Removed: a dead COUNT(*) query that was fired before every feed fetch
	// but whose result was never returned or used by any caller.
	//
	// Removed: LEFT JOIN likes + GROUP BY — same spurious join fixed in
	// following.ts and new.ts. lyntObj already counts likes via its own
	// correlated subquery; joining the raw likes rows just bloats the
	// intermediate result set before the group collapses it away.

	const feed = await db
		.select(lyntObj(userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(
			and(
				eq(lynts.user_id, handleUserId),
				or(and(eq(lynts.reposted, false), isNull(lynts.parent)), eq(lynts.reposted, true)),
				before ? lt(lynts.created_at, new Date(before)) : undefined,
				minIq !== undefined && minIq !== null ? gte(users.iq, minIq) : undefined
			)
		)
		.orderBy(desc(lynts.created_at))
		.limit(50);

	return feed;
}
