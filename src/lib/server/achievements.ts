import { db } from '@/server/db';
import {
	users,
	lynts,
	followers,
	forumPosts,
	userAchievements,
	dmMessages,
	polls
} from '@/server/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import { sendToUser } from '$lib/ws';
import { ACHIEVEMENT_CATALOG, type AchievementDef } from '$lib/achievements';

interface UserStats {
	postCount: number;
	repostCount: number;
	followerCount: number;
	loginStreak: number;
	iq: number;
	// Current balance, not true lifetime-earned — there's no coin sink yet
	// so nothing's ever spent, making this a fine stand-in for now. Once a
	// shop exists this should switch to SUM(lc_transactions.amount).
	lyntCoins: number;
	forumPostCount: number;
	unlockedCount: number; // how many the user already has, used by the Hunter family
	sentDM: boolean;
	createdPoll: boolean;
	rugplayLinked: boolean;
	nightOwl: boolean;
	quickEdit: boolean;
}

// Every non-meta achievement's condition. "achievement_hunter*" (the meta
// family) is handled separately, after this batch, since it depends on how
// many of these just got unlocked.
const CHECKS: Record<string, (stats: UserStats) => boolean> = {
	first_lynt: (s) => s.postCount >= 1,
	yapper_10: (s) => s.postCount >= 10,
	yapper_100: (s) => s.postCount >= 100,
	yapper_500: (s) => s.postCount >= 500,
	streak_7: (s) => s.loginStreak >= 7,
	streak_30: (s) => s.loginStreak >= 30,
	streak_100: (s) => s.loginStreak >= 100,
	followers_20: (s) => s.followerCount >= 20,
	followers_50: (s) => s.followerCount >= 50,
	followers_100: (s) => s.followerCount >= 100,
	big_brain: (s) => s.iq >= 130,
	big_brain_2: (s) => s.iq >= 145,
	big_brain_3: (s) => s.iq >= 160,
	forum_regular: (s) => s.forumPostCount >= 10,
	forum_veteran: (s) => s.forumPostCount >= 50,
	forum_legend: (s) => s.forumPostCount >= 200,
	xp_hoarder: (s) => s.lyntCoins >= 2500,
	xp_hoarder_2: (s) => s.lyntCoins >= 10000,
	xp_hoarder_3: (s) => s.lyntCoins >= 50000,
	first_dm: (s) => s.sentDM,
	first_poll: (s) => s.createdPoll,
	first_repost: (s) => s.repostCount >= 1,
	rugplay_linked: (s) => s.rugplayLinked,
	night_owl: (s) => s.nightOwl,
	quick_edit: (s) => s.quickEdit
};

// Hunter family thresholds, checked against how many OTHER achievements
// are already unlocked at the time each is evaluated.
const HUNTER_THRESHOLDS: Record<string, number> = {
	achievement_hunter: 5,
	achievement_hunter_2: 15,
	achievement_hunter_3: 25
};

async function getStats(userId: string): Promise<UserStats> {
	const [
		[user],
		[postRow],
		[repostRow],
		[followerRow],
		[forumRow],
		[unlockedRow],
		[dmRow],
		[pollRow],
		[nightOwlRow],
		[quickEditRow]
	] = await Promise.all([
		db
			.select({
				loginStreak: users.login_streak,
				iq: users.iq,
				lyntCoins: users.lynt_coins,
				rugplayUsername: users.rugplay_username
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(lynts)
			.where(and(eq(lynts.user_id, userId), isNull(lynts.parent), eq(lynts.reposted, false))),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(lynts)
			.where(and(eq(lynts.user_id, userId), eq(lynts.reposted, true))),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(followers)
			.where(eq(followers.user_id, userId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(forumPosts)
			.where(eq(forumPosts.user_id, userId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(userAchievements)
			.where(eq(userAchievements.user_id, userId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(dmMessages)
			.where(eq(dmMessages.sender_id, userId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(polls)
			.innerJoin(lynts, eq(polls.lynt_id, lynts.id))
			.where(eq(lynts.user_id, userId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(lynts)
			.where(
				and(
					eq(lynts.user_id, userId),
					sql`extract(hour from ${lynts.created_at}) between 2 and 3`
				)
			),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(lynts)
			.where(
				and(
					eq(lynts.user_id, userId),
					isNotNull(lynts.edited_at),
					sql`extract(epoch from (${lynts.edited_at} - ${lynts.created_at})) < 10`
				)
			)
	]);

	return {
		postCount: postRow?.count ?? 0,
		repostCount: repostRow?.count ?? 0,
		followerCount: followerRow?.count ?? 0,
		loginStreak: user?.loginStreak ?? 0,
		iq: user?.iq ?? 0,
		lyntCoins: user?.lyntCoins ?? 0,
		forumPostCount: forumRow?.count ?? 0,
		unlockedCount: unlockedRow?.count ?? 0,
		sentDM: (dmRow?.count ?? 0) >= 1,
		createdPoll: (pollRow?.count ?? 0) >= 1,
		rugplayLinked: !!user?.rugplayUsername,
		nightOwl: (nightOwlRow?.count ?? 0) >= 1,
		quickEdit: (quickEditRow?.count ?? 0) >= 1
	};
}

async function unlock(userId: string, achievement: AchievementDef): Promise<boolean> {
	const inserted = await db
		.insert(userAchievements)
		.values({ user_id: userId, achievement_key: achievement.key })
		.onConflictDoNothing()
		.returning();

	if (inserted.length === 0) return false; // already unlocked

	// Unlocking no longer auto-credits the Community XP bonus — the
	// Achievements page shows a "Claim" button on unlocked-but-unclaimed
	// cards, and POST /api/achievements/claim (which does the actual
	// crediting) is the only place lynt_coins gets touched for this. This
	// event is purely "hey, something's ready to claim." Secret
	// achievements still announce themselves in full on unlock — the
	// surprise is in not knowing about it beforehand, not in staying
	// hidden after you've earned it.
	sendToUser(userId, {
		type: 'achievement_unlocked',
		key: achievement.key,
		name: achievement.name,
		description: achievement.description,
		tier: achievement.tier,
		coinReward: achievement.coinReward,
		icon: achievement.icon
	});

	return true;
}

/**
 * Checks every achievement the user hasn't already unlocked and unlocks
 * any that now qualify. Not free (a double-digit number of count queries,
 * run in parallel) — called from the same chokepoints as LyntCoins awards
 * (see lyntcoins.ts's awardCoins) plus the follow endpoint, not on every
 * request.
 */
export async function evaluateAchievements(userId: string): Promise<void> {
	const [stats, existingRows] = await Promise.all([
		getStats(userId),
		db
			.select({ key: userAchievements.achievement_key })
			.from(userAchievements)
			.where(eq(userAchievements.user_id, userId))
	]);

	const alreadyUnlocked = new Set(existingRows.map((r) => r.key));
	// How many non-Hunter achievements this user has, for the Hunter
	// family's own thresholds — recomputed as we go so unlocking several
	// achievements in one pass can also unlock a Hunter tier immediately.
	let otherUnlockedCount = [...alreadyUnlocked].filter((k) => !HUNTER_THRESHOLDS[k]).length;

	for (const achievement of ACHIEVEMENT_CATALOG) {
		if (HUNTER_THRESHOLDS[achievement.key]) continue; // meta, handled below
		if (alreadyUnlocked.has(achievement.key)) continue;
		const check = CHECKS[achievement.key];
		if (check && check(stats)) {
			await unlock(userId, achievement);
			alreadyUnlocked.add(achievement.key);
			otherUnlockedCount += 1;
		}
	}

	for (const [key, threshold] of Object.entries(HUNTER_THRESHOLDS)) {
		if (alreadyUnlocked.has(key)) continue;
		if (otherUnlockedCount < threshold) continue;
		const achievement = ACHIEVEMENT_CATALOG.find((a) => a.key === key);
		if (achievement) await unlock(userId, achievement);
	}
}

export type ClaimResult =
	| { ok: true; amount: number }
	| { ok: false; error: 'not_unlocked' | 'already_claimed' | 'unknown_achievement' };

/**
 * Collects the Community XP bonus for an already-unlocked achievement.
 * Called from POST /api/achievements/claim — this is the ONLY place that
 * credits an achievement's coin reward, now that unlock() no longer does
 * it automatically.
 */
export async function claimAchievement(userId: string, key: string): Promise<ClaimResult> {
	const achievement = ACHIEVEMENT_CATALOG.find((a) => a.key === key);
	if (!achievement) return { ok: false, error: 'unknown_achievement' };

	const [row] = await db
		.select({ claimedAt: userAchievements.claimed_at })
		.from(userAchievements)
		.where(and(eq(userAchievements.user_id, userId), eq(userAchievements.achievement_key, key)))
		.limit(1);

	if (!row) return { ok: false, error: 'not_unlocked' };
	if (row.claimedAt) return { ok: false, error: 'already_claimed' };

	// Mark claimed first with a conditional WHERE (claimed_at IS NULL) so
	// two simultaneous claim requests can't both pass the check above and
	// both credit coins — only one UPDATE actually matches a row.
	const claimed = await db
		.update(userAchievements)
		.set({ claimed_at: new Date() })
		.where(
			and(
				eq(userAchievements.user_id, userId),
				eq(userAchievements.achievement_key, key),
				isNull(userAchievements.claimed_at)
			)
		)
		.returning();

	if (claimed.length === 0) return { ok: false, error: 'already_claimed' };

	// Bypasses the daily earn cap, same reasoning as the old auto-credit
	// path had — a milestone reward shouldn't get swallowed by the cap.
	await db
		.update(users)
		.set({ lynt_coins: sql`${users.lynt_coins} + ${achievement.coinReward}` })
		.where(eq(users.id, userId));

	// Reuses the same Coin Pop toast every other reward uses.
	sendToUser(userId, {
		type: 'lyntcoins_awarded',
		amount: achievement.coinReward,
		reason: 'achievement_bonus',
		capped: false
	});

	return { ok: true, amount: achievement.coinReward };
}

export type PinResult = { ok: true } | { ok: false; error: 'not_unlocked' | 'unknown_achievement' };

/**
 * Sets (or clears, if key is null) the achievement shown as flair next to
 * the user's name. Only an unlocked achievement can be pinned — claimed or
 * not, since pinning is about display, not the XP reward.
 */
export async function pinAchievement(userId: string, key: string | null): Promise<PinResult> {
	if (key === null) {
		await db.update(users).set({ pinned_achievement_key: null }).where(eq(users.id, userId));
		return { ok: true };
	}

	const achievement = ACHIEVEMENT_CATALOG.find((a) => a.key === key);
	if (!achievement) return { ok: false, error: 'unknown_achievement' };

	const [row] = await db
		.select({ key: userAchievements.achievement_key })
		.from(userAchievements)
		.where(and(eq(userAchievements.user_id, userId), eq(userAchievements.achievement_key, key)))
		.limit(1);

	if (!row) return { ok: false, error: 'not_unlocked' };

	await db.update(users).set({ pinned_achievement_key: key }).where(eq(users.id, userId));
	return { ok: true };
}
