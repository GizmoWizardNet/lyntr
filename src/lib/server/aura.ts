import { db } from '@/server/db';
import { users, lynts, followers, userAchievements } from '@/server/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { auraTier } from '$lib/aura';

export { auraTier };
export type { AuraTier } from '$lib/aura';

/**
 * Recomputes and persists a user's Aura Score. Deliberately a grab-bag
 * formula, not a rigorous one — it mixes IQ, login streak, Community XP
 * balance, follower count, and achievements unlocked, each capped so no
 * single input can dominate the score by itself (e.g. someone who just
 * hoards XP without doing anything else shouldn't out-rank someone active
 * across every category).
 */
export async function recalcAura(userId: string): Promise<number> {
	const [[user], [postRow], [followerRow], [achievementRow]] = await Promise.all([
		db
			.select({ iq: users.iq, loginStreak: users.login_streak, lyntCoins: users.lynt_coins })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(lynts)
			.where(and(eq(lynts.user_id, userId), isNull(lynts.parent), eq(lynts.reposted, false))),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(followers)
			.where(eq(followers.user_id, userId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(userAchievements)
			.where(eq(userAchievements.user_id, userId))
	]);

	if (!user) return 0;

	const iqPoints = Math.min(user.iq ?? 100, 200) * 3; // cap: absurdly high IQ claims don't blow up the score
	const streakPoints = Math.min(user.loginStreak ?? 0, 100) * 8;
	const coinPoints = Math.min(user.lyntCoins ?? 0, 5000) / 5;
	const postPoints = Math.min(postRow?.count ?? 0, 500) * 2;
	const followerPoints = Math.min(followerRow?.count ?? 0, 5000) / 2;
	const achievementPoints = (achievementRow?.count ?? 0) * 60;

	const score = Math.round(
		iqPoints + streakPoints + coinPoints + postPoints + followerPoints + achievementPoints
	);

	await db.update(users).set({ aura_score: score }).where(eq(users.id, userId));

	return score;
}
