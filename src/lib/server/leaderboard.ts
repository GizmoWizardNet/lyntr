import { db } from './db';
import { users, followers, forumPosts, forumPostVotes, userAchievements } from './schema';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';

export type LeaderboardCategory = 'iq' | 'followers' | 'forum' | 'networth' | 'achievements';

export const CATEGORY_LABELS: Record<LeaderboardCategory, string> = {
	iq: 'IQ Score',
	followers: 'Followers',
	forum: 'Forum Reputation',
	networth: 'Net Worth (Rugplay)',
	achievements: 'Achievements'
};

export interface LeaderboardEntry {
	userId: string;
	handle: string;
	username: string;
	nameColor?: string | null;
	verified?: boolean;
	value: number;
	rank: number; // 1-based
}

// ---------------------------------------------------------------------------
// IQ — straight from users.iq
// ---------------------------------------------------------------------------
export async function getIQLeaderboard(limit: number, offset = 0): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
	const rows = await db
		.select({ userId: users.id, handle: users.handle, username: users.username, nameColor: users.name_color, verified: users.verified, value: users.iq })
		.from(users)
		.orderBy(desc(users.iq))
		.limit(limit + 1)
		.offset(offset);

	const hasMore = rows.length > limit;
	const entries = rows.slice(0, limit).map((r, i) => ({ ...r, rank: offset + i + 1 }));
	return { entries, hasMore };
}

// ---------------------------------------------------------------------------
// Followers — count of rows in `followers` where user_id = this user.
// `followers` has no `id` column (composite PK), so the correlated subquery
// below is safe to write with plain column-object interpolation.
// ---------------------------------------------------------------------------
export async function getFollowersLeaderboard(limit: number, offset = 0): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
	const followerCount = sql<number>`(
		select count(*) from ${followers} where ${followers.user_id} = ${users.id}
	)`.as('value');

	const rows = await db
		.select({ userId: users.id, handle: users.handle, username: users.username, nameColor: users.name_color, verified: users.verified, value: followerCount })
		.from(users)
		.orderBy(desc(followerCount))
		.limit(limit + 1)
		.offset(offset);

	const hasMore = rows.length > limit;
	const entries = rows.slice(0, limit).map((r, i) => ({ ...r, rank: offset + i + 1 }));
	return { entries, hasMore };
}

// ---------------------------------------------------------------------------
// Forum reputation — sum of vote values across a user's (non-deleted) posts.
// Plain join + group by (not a raw correlated subquery), so the
// auto-qualification of `id` columns across forum_posts/forum_post_votes
// isn't a concern here the way it was for /api/forum/categories.
// ---------------------------------------------------------------------------
export async function getForumLeaderboard(limit: number, offset = 0): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
	const value = sql<number>`coalesce(sum(${forumPostVotes.value}), 0)`.as('value');

	const rows = await db
		.select({
			userId: forumPosts.user_id,
			handle: users.handle,
			username: users.username,
			nameColor: users.name_color,
			verified: users.verified,
			value
		})
		.from(forumPosts)
		.leftJoin(users, eq(users.id, forumPosts.user_id))
		.leftJoin(forumPostVotes, eq(forumPostVotes.post_id, forumPosts.id))
		.where(eq(forumPosts.deleted, false))
		.groupBy(forumPosts.user_id, users.handle, users.username, users.name_color, users.verified)
		.orderBy(desc(value))
		.limit(limit + 1)
		.offset(offset);

	const hasMore = rows.length > limit;
	const entries = rows
		.slice(0, limit)
		.filter((r) => !!r.userId && !!r.handle)
		.map((r, i) => ({
			userId: r.userId as string,
			handle: r.handle as string,
			username: (r.username ?? '') as string,
			nameColor: r.nameColor,
			verified: !!r.verified,
			value: r.value,
			rank: offset + i + 1
		}));
	return { entries, hasMore };
}

// ---------------------------------------------------------------------------
// Net worth — Rugplay's API has no per-user portfolio endpoint, only
// holders-per-coin. So we scan the top N coins by market cap ONCE, find the
// best (largest) single holding for every Lyntr user with a linked Rugplay
// account, and rank by that. Same "biggest bag" semantics as the per-profile
// NetWorthBadge, just computed for everyone in one pass instead of one
// request per profile. Heavily cached — Rugplay's key is rate-limited to
// 2,000 req/day shared across all of Lyntr.
// ---------------------------------------------------------------------------
const SCAN_LIMIT = Math.min(parseInt(process.env.RUGPLAY_NETWORTH_SCAN_LIMIT ?? '15', 10) || 15, 100);
const NETWORTH_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const PER_REQUEST_TIMEOUT_MS = 6_000;
const OVERALL_DEADLINE_MS = 20_000;
const CONCURRENCY = 5;

let networthCache: { data: LeaderboardEntry[]; expiresAt: number } | null = null;

async function rugplayFetch(path: string, apiKey: string) {
	const res = await fetch(`https://rugplay.com/api/v1/${path}`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Rugplay API error ${res.status} on ${path}`);
	return res.json();
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

async function computeNetWorthLeaderboard(): Promise<LeaderboardEntry[]> {
	const apiKey = process.env.RUGPLAY_API_KEY;
	if (!apiKey) return [];

	const linked = await db
		.select({ id: users.id, handle: users.handle, username: users.username, nameColor: users.name_color, rugplay_username: users.rugplay_username })
		.from(users)
		.where(isNotNull(users.rugplay_username));
	if (linked.length === 0) return [];

	const byRugplayName = new Map(linked.map((u) => [u.rugplay_username!.toLowerCase(), u]));
	const best = new Map<string, number>(); // rugplay username (lowercase) -> largest holding value

	try {
		const deadline = Date.now() + OVERALL_DEADLINE_MS;
		const market = await rugplayFetch(`market?sortBy=marketCap&sortOrder=desc&limit=${SCAN_LIMIT}&page=1`, apiKey);
		const coins: { symbol: string }[] = market.coins ?? [];

		for (const batch of chunk(coins, CONCURRENCY)) {
			if (Date.now() > deadline) break;

			const results = await Promise.allSettled(batch.map((coin) => rugplayFetch(`holders/${coin.symbol}?limit=200`, apiKey)));

			for (const result of results) {
				if (result.status !== 'fulfilled') continue;
				for (const holder of result.value.holders ?? []) {
					const key = holder.username?.toLowerCase();
					if (!key || !byRugplayName.has(key)) continue;
					const current = best.get(key) ?? 0;
					if (holder.liquidationValue > current) best.set(key, holder.liquidationValue);
				}
			}
		}
	} catch (err) {
		console.error('Net worth leaderboard scan error:', err);
	}

	return [...best.entries()]
		.map(([rugplayName, value]) => {
			const u = byRugplayName.get(rugplayName)!;
			return { userId: u.id, handle: u.handle, username: u.username, nameColor: u.nameColor, verified: u.verified, value };
		})
		.sort((a, b) => b.value - a.value)
		.map((e, i) => ({ ...e, rank: i + 1 }));
}

export async function getNetWorthLeaderboard(limit: number, offset = 0): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
	if (!(networthCache && Date.now() < networthCache.expiresAt)) {
		const data = await computeNetWorthLeaderboard();
		networthCache = { data, expiresAt: Date.now() + NETWORTH_CACHE_TTL };
	}

	const full = networthCache.data;
	const page = full.slice(offset, offset + limit + 1);
	return { entries: page.slice(0, limit), hasMore: page.length > limit };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Achievements — count of rows in `user_achievements` where user_id = this
// user. Same correlated-subquery shape as getFollowersLeaderboard, since
// user_achievements also has no single-column id (composite PK).
// ---------------------------------------------------------------------------
export async function getAchievementsLeaderboard(limit: number, offset = 0): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
	const achievementCount = sql<number>`(
		select count(*) from ${userAchievements} where ${userAchievements.user_id} = ${users.id}
	)`.as('value');

	const rows = await db
		.select({ userId: users.id, handle: users.handle, username: users.username, nameColor: users.name_color, verified: users.verified, value: achievementCount })
		.from(users)
		.orderBy(desc(achievementCount))
		.limit(limit + 1)
		.offset(offset);

	const hasMore = rows.length > limit;
	const entries = rows.slice(0, limit).map((r, i) => ({ ...r, rank: offset + i + 1 }));
	return { entries, hasMore };
}

export async function getLeaderboard(
	category: LeaderboardCategory,
	limit = 10,
	offset = 0
): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
	switch (category) {
		case 'iq':
			return getIQLeaderboard(limit, offset);
		case 'followers':
			return getFollowersLeaderboard(limit, offset);
		case 'forum':
			return getForumLeaderboard(limit, offset);
		case 'networth':
			return getNetWorthLeaderboard(limit, offset);
		case 'achievements':
			return getAchievementsLeaderboard(limit, offset);
	}
}

// Top 3 across every category — this is what badges everywhere (profile,
// hover cards) render off of. Computed fresh from current standings every
// time, so a badge disappears the moment someone drops out of the top 3 —
// there's no persisted "you earned this" flag.
export async function getTop3All(): Promise<Record<LeaderboardCategory, LeaderboardEntry[]>> {
	const [iq, followersBoard, forum, networth, achievements] = await Promise.all([
		getIQLeaderboard(3),
		getFollowersLeaderboard(3),
		getForumLeaderboard(3),
		getNetWorthLeaderboard(3),
		getAchievementsLeaderboard(3)
	]);
	return {
		iq: iq.entries,
		followers: followersBoard.entries,
		forum: forum.entries,
		networth: networth.entries,
		achievements: achievements.entries
	};
}
