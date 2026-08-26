import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, users } from '@/server/schema';
import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import { lyntObj, hydratePolls } from '../../../../util';

// GET /api/v2/lynts/all/comments — the most recent comments across every
// lynt on Lyntr, newest first, not scoped to any one parent.
//
// New in v2, requested by @libhmrc (@nothmrc): before this, getting recent
// comments meant polling GET /lynts/:id/comments once per lynt you cared
// about — slow, and an easy way to get rate-limited if you're watching a
// lot of posts. This is the same data, just queried the other way around
// (by time, across all parents at once) instead of per-parent.
//
// `before`: an ISO timestamp cursor, same convention as the other paginated
// endpoints (feed, comments) — pass the createdAt of the oldest comment
// you've already seen to get the next page.
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const before = url.searchParams.get('before');

	// No join against `likes` here — lyntObj()'s likeCount is a
	// self-contained correlated subquery, so joining likes would only add
	// duplicate rows (one per like) without a groupBy to collapse them
	// back down. v1's per-lynt comments endpoint has this same join +
	// a groupBy to compensate; simplest correct fix here is to just not
	// join what isn't needed.
	const comments = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(
			and(
				isNotNull(lynts.parent),
				eq(lynts.reposted, false),
				before ? lt(lynts.created_at, new Date(before)) : undefined
			)
		)
		.orderBy(desc(lynts.created_at))
		.limit(50);

	return json({ comments: hydratePolls(comments) });
};
