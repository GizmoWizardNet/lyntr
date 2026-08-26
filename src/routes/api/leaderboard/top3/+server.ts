import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getTop3All } from '@/server/leaderboard';

// ---------------------------------------------------------------------------
// GET /api/leaderboard/top3 — current top-3 entries for every category, in
// one call. The frontend fetches this once and looks handles up locally so
// rendering a trophy badge next to any username doesn't mean a network
// round-trip per user shown (feeds, hover cards, etc.).
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async () => {
	const top3 = await getTop3All();
	return json(top3);
};
