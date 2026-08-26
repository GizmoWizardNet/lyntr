import { db } from '@/server/db';
import { users, lcTransactions } from '@/server/schema';
import { eq, sql } from 'drizzle-orm';
import { sendToUser } from '$lib/ws';
import { evaluateAchievements } from './achievements';
import { recalcAura } from './aura';

// ──────────────────────────────────────────────────────────────────────────
// LyntCoins — Phase 1: Earning system
//
// Design notes (see chat for the full spec this implements):
//   1. Daily activity pool — DAILY_CAP per user per UTC day. Once hit, all
//      further earn attempts are no-ops (the underlying action — posting,
//      liking, etc — still works, it just stops paying out).
//   2. Diminishing returns on post creation (40 / 25 / 15 / 10 / 5 / 5 / ...).
//   3. Engagement rewards: the *creator* earns LC when their post is liked,
//      replied to, bookmarked, or reposted — not for raw posting volume.
//   4. Curator bonus: an early liker (before a popularity threshold) gets a
//      small reward for surfacing something that turns out to be good.
//   5. Streak bonuses at 7/14/30 days, layered on top of the existing
//      login_streak column.
//
// Deferred to later phases (per the roadmap): quality/trust multiplier
// formula, weekly missions, leaderboards, community bonus pool, bounties,
// reputation multiplier, and the spend/shop system itself.
// ──────────────────────────────────────────────────────────────────────────

export const DAILY_CAP = 200;

export const POST_REWARD_LADDER = [40, 25, 15, 10] as const;
export const POST_REWARD_FLOOR = 5; // every post after the ladder is exhausted

export const ENGAGEMENT_REWARDS = {
	like_received: 4, // per-like amount — see awardLikeReceived for the milestone-feel rationale
	reply_received: 15,
	bookmark_received: 10,
	repost_received: 20
} as const;

// Curator bonus: reward for liking a post while it's still small, paid to
// the liker (not the creator). "Early" = liked while the post has fewer
// than this many likes at the time of the like.
export const CURATOR_EARLY_THRESHOLD = 20;
export const CURATOR_BONUS = 3;

export const STREAK_BONUSES: Record<number, number> = {
	7: 50,
	14: 100,
	30: 250
};

export type LcReason =
	| 'post_created'
	| 'like_received'
	| 'reply_received'
	| 'bookmark_received'
	| 'repost_received'
	| 'curator_bonus'
	| 'streak_bonus'
	// Not actually paid out via awardCoins() — achievements.ts credits this
	// bonus directly (see unlock() there, and the recursion note on the
	// evaluateAchievements() call below). Included here anyway so the
	// 'achievement_bonus' string used in that WS event payload and in
	// CoinPop.svelte's REASON_LABEL map has one canonical type it's
	// checked against, instead of being a bare string with no source of
	// truth.
	| 'achievement_bonus';

function todayUTC(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Resets a user's daily pool/post counters if they've rolled into a new
 * UTC day. Cheap no-op if they're already current. Call this before every
 * award attempt.
 */
async function ensureDailyReset(userId: string): Promise<void> {
	const today = todayUTC();
	await db
		.update(users)
		.set({ lc_earned_today: 0, lc_posts_today: 0, lc_pool_date: today })
		.where(sql`${users.id} = ${userId} AND (${users.lc_pool_date} IS DISTINCT FROM ${today})`);
}

interface AwardOptions {
	userId: string;
	amount: number;
	reason: LcReason;
	lyntId?: string | null;
	sourceUserId?: string | null;
	/** Skip the daily cap entirely. Use sparingly — currently only used for
	 *  streak bonuses, kept generic as an escape hatch for the future. */
	ignoreCap?: boolean;
}

interface AwardResult {
	awarded: number; // actual amount paid out, after cap clamping (0 if nothing)
	capped: boolean; // true if the daily pool limited the payout
	duplicate: boolean; // true if this exact (lynt, source, reason) was already paid
}

/**
 * The single entry point for paying out LyntCoins. Handles: daily-pool
 * capping, dedup (via the unique index on lc_transactions), and keeping
 * users.lynt_coins / lc_earned_today in sync.
 *
 * Safe to call liberally — duplicate or over-cap calls just become no-ops
 * rather than errors, so call sites don't need to pre-check anything.
 */
export async function awardCoins(opts: AwardOptions): Promise<AwardResult> {
	const { userId, amount, reason, lyntId = null, sourceUserId = null, ignoreCap = false } = opts;

	if (amount <= 0) return { awarded: 0, capped: false, duplicate: false };

	await ensureDailyReset(userId);

	const [user] = await db
		.select({ earnedToday: users.lc_earned_today })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) return { awarded: 0, capped: false, duplicate: false };

	const remaining = ignoreCap ? amount : Math.max(0, DAILY_CAP - user.earnedToday);
	const payout = Math.min(amount, remaining);

	if (payout <= 0) {
		return { awarded: 0, capped: true, duplicate: false };
	}

	// Insert the ledger row first — the unique dedup index does the heavy
	// lifting here. If this exact (lynt_id, source_user_id, reason) combo
	// already exists, onConflictDoNothing means we insert nothing and we
	// can bail out without touching the user's balance.
	const inserted = await db
		.insert(lcTransactions)
		.values({
			user_id: userId,
			amount: payout,
			reason,
			lynt_id: lyntId,
			source_user_id: sourceUserId
		})
		.onConflictDoNothing({
			target: [lcTransactions.lynt_id, lcTransactions.source_user_id, lcTransactions.reason]
		})
		.returning({ id: lcTransactions.id });

	if (inserted.length === 0) {
		return { awarded: 0, capped: false, duplicate: true };
	}

	await db
		.update(users)
		.set({
			lynt_coins: sql`${users.lynt_coins} + ${payout}`,
			lc_earned_today: sql`${users.lc_earned_today} + ${payout}`
		})
		.where(eq(users.id, userId));

	// ── Fun & engaging bit ──────────────────────────────────────────
	// Every successful award — post rewards, likes/replies/reposts
	// received, streak bonuses, all of it — pushes a live "coin pop"
	// event to that user's open tabs. This is the single choke point
	// every award path already goes through, so it's the one place
	// that needs to know about the celebratory UI at all. The client
	// decides how to render it (see MainPage.svelte's `lyntcoins_awarded`
	// listener) — this just reports the fact.
	sendToUser(userId, {
		type: 'lyntcoins_awarded',
		amount: payout,
		reason,
		capped: payout < amount
	});

	// Same reasoning as the Coin Pop broadcast above: awardCoins is the one
	// place nearly every rewardable action already flows through, so it's
	// also the natural place to re-check achievement unlocks and refresh
	// the Aura Score, rather than sprinkling calls to both across every
	// individual endpoint. Fire-and-forget — neither should ever slow down
	// or fail the actual coin award they're piggybacking on.
	//
	// Note: unlocking an achievement credits its own coin bonus directly
	// (see achievements.ts's `unlock()`), it does not call back into
	// awardCoins, so this can't recurse.
	evaluateAchievements(userId).catch((err) =>
		console.error('Achievement evaluation error (non-fatal):', err)
	);
	recalcAura(userId).catch((err) => console.error('Aura recalculation error (non-fatal):', err));

	return { awarded: payout, capped: payout < amount, duplicate: false };
}

/**
 * Call when a user creates an original (non-repost) post. Bumps their daily
 * post counter and pays out the diminishing-returns reward for that post's
 * position in today's posting order.
 */
export async function awardPostCreated(userId: string, lyntId: string): Promise<AwardResult> {
	await ensureDailyReset(userId);

	const [{ postsToday }] = await db
		.update(users)
		.set({ lc_posts_today: sql`${users.lc_posts_today} + 1` })
		.where(eq(users.id, userId))
		.returning({ postsToday: users.lc_posts_today });

	const index = postsToday - 1; // 0-based position of *this* post today
	const reward = index < POST_REWARD_LADDER.length ? POST_REWARD_LADDER[index] : POST_REWARD_FLOOR;

	return awardCoins({ userId, amount: reward, reason: 'post_created', lyntId });
}

/**
 * Call when `lyntId` (owned by `authorId`) receives a like from `likerId`.
 * Pays the engagement reward to the author, and — if the post is still
 * "early" — a curator bonus to the liker. Both are deduped per-liker so
 * unliking and reliking the same post never pays out twice.
 *
 * `likeCountBeforeThisLike` should be the like count *before* this like was
 * recorded, so the threshold check reflects what the liker saw when they
 * acted.
 */
export async function awardLikeReceived(
	authorId: string,
	likerId: string,
	lyntId: string,
	likeCountBeforeThisLike: number
): Promise<{ authorAward: AwardResult; curatorAward: AwardResult | null }> {
	const authorAward =
		authorId !== likerId
			? await awardCoins({
					userId: authorId,
					amount: ENGAGEMENT_REWARDS.like_received,
					reason: 'like_received',
					lyntId,
					sourceUserId: likerId
				})
			: { awarded: 0, capped: false, duplicate: false };

	let curatorAward: AwardResult | null = null;
	if (authorId !== likerId && likeCountBeforeThisLike < CURATOR_EARLY_THRESHOLD) {
		curatorAward = await awardCoins({
			userId: likerId,
			amount: CURATOR_BONUS,
			reason: 'curator_bonus',
			lyntId,
			sourceUserId: likerId
		});
	}

	return { authorAward, curatorAward };
}

export async function awardReplyReceived(
	authorId: string,
	replierId: string,
	parentLyntId: string
): Promise<AwardResult> {
	if (authorId === replierId) return { awarded: 0, capped: false, duplicate: false };
	return awardCoins({
		userId: authorId,
		amount: ENGAGEMENT_REWARDS.reply_received,
		reason: 'reply_received',
		lyntId: parentLyntId,
		sourceUserId: replierId
	});
}

export async function awardBookmarkReceived(
	authorId: string,
	bookmarkerId: string,
	lyntId: string
): Promise<AwardResult> {
	if (authorId === bookmarkerId) return { awarded: 0, capped: false, duplicate: false };
	return awardCoins({
		userId: authorId,
		amount: ENGAGEMENT_REWARDS.bookmark_received,
		reason: 'bookmark_received',
		lyntId,
		sourceUserId: bookmarkerId
	});
}

export async function awardRepostReceived(
	authorId: string,
	reposterId: string,
	lyntId: string
): Promise<AwardResult> {
	if (authorId === reposterId) return { awarded: 0, capped: false, duplicate: false };
	return awardCoins({
		userId: authorId,
		amount: ENGAGEMENT_REWARDS.repost_received,
		reason: 'repost_received',
		lyntId,
		sourceUserId: reposterId
	});
}

/**
 * Call after login_streak has been updated for the day. Pays out the
 * milestone bonus the *first* time a user hits 7/14/30 (checked against
 * the ledger, not the daily cap — streak bonuses should land even if the
 * user already capped out today, since missing them feels bad and they're
 * infrequent by nature).
 */
export async function awardStreakBonus(userId: string, newStreak: number): Promise<AwardResult | null> {
	const bonus = STREAK_BONUSES[newStreak];
	if (!bonus) return null;

	// Streak bonuses aren't tied to a lynt/source, so the ledger's unique
	// index can't dedup them for us (NULLs never collide) — check manually.
	const [already] = await db
		.select({ id: lcTransactions.id })
		.from(lcTransactions)
		.where(
			sql`${lcTransactions.user_id} = ${userId} AND ${lcTransactions.reason} = 'streak_bonus' AND ${lcTransactions.amount} = ${bonus}`
		)
		.limit(1);

	if (already) return { awarded: 0, capped: false, duplicate: true };

	return awardCoins({ userId, amount: bonus, reason: 'streak_bonus', ignoreCap: true });
}
