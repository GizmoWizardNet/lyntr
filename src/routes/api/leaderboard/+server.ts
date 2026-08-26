import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getLeaderboard, type LeaderboardCategory } from '@/server/leaderboard';

const VALID_CATEGORIES: LeaderboardCategory[] = ['iq', 'followers', 'forum', 'networth', 'achievements'];

// ---------------------------------------------------------------------------
// GET /api/leaderboard?category=iq|followers|forum|networth&limit=10&offset=0
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category') as LeaderboardCategory | null;
	if (!category || !VALID_CATEGORIES.includes(category))
		return json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });

	const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10), 1), 50);
	const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

	const { entries, hasMore } = await getLeaderboard(category, limit, offset);
	return json({ category, entries, limit, offset, hasMore });
};
