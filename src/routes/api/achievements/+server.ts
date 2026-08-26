import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { userAchievements, users } from '@/server/schema';
import { eq, sql } from 'drizzle-orm';
import { ACHIEVEMENT_CATALOG } from '$lib/achievements';

export const GET: RequestHandler = async ({ cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		if (!jwtPayload.userId) {
			throw new Error('Invalid JWT token');
		}
		const userId = jwtPayload.userId;

		const [unlockedRows, rarityRows, [totalUsersRow], [me]] = await Promise.all([
			db
				.select({
					key: userAchievements.achievement_key,
					unlockedAt: userAchievements.unlocked_at,
					seenAt: userAchievements.seen_at,
					claimedAt: userAchievements.claimed_at
				})
				.from(userAchievements)
				.where(eq(userAchievements.user_id, userId)),
			// Rarity: how many users (out of everyone) have each achievement.
			// One aggregate query for the whole catalog rather than one COUNT
			// per achievement.
			db
				.select({
					key: userAchievements.achievement_key,
					count: sql<number>`count(*)::int`
				})
				.from(userAchievements)
				.groupBy(userAchievements.achievement_key),
			db.select({ count: sql<number>`count(*)::int` }).from(users),
			db
				.select({ pinnedKey: users.pinned_achievement_key })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)
		]);

		const unlockedByKey = new Map(unlockedRows.map((r) => [r.key, r]));
		const rarityByKey = new Map(rarityRows.map((r) => [r.key, r.count]));
		const totalUsers = totalUsersRow?.count ?? 0;

		const achievements = ACHIEVEMENT_CATALOG.map((def) => {
			const unlock = unlockedByKey.get(def.key);
			const unlocked = !!unlock;
			const rarityCount = rarityByKey.get(def.key) ?? 0;
			const rarityPercent = totalUsers > 0 ? Math.round((rarityCount / totalUsers) * 1000) / 10 : 0;

			// Secret + still locked: hide the spoiler fields. Family/level/
			// tier/coinReward stay (a "???" card in a ladder still shows its
			// tier ring and reward, just not what it's for), but name/
			// description/icon get placeholders the client renders as a
			// generic "???" silhouette.
			if (def.secret && !unlocked) {
				return {
					...def,
					name: '???',
					description: 'Keep using Lyntr to find out.',
					icon: '',
					unlocked: false,
					unlockedAt: null,
					seenAt: null,
					claimedAt: null,
					rarityPercent
				};
			}

			return {
				...def,
				unlocked,
				unlockedAt: unlock?.unlockedAt ?? null,
				seenAt: unlock?.seenAt ?? null,
				claimedAt: unlock?.claimedAt ?? null,
				rarityPercent
			};
		});

		return json({
			achievements,
			unlockedCount: unlockedRows.length,
			totalCount: ACHIEVEMENT_CATALOG.length,
			pinnedKey: me?.pinnedKey ?? null
		});
	} catch (error) {
		console.error('Error fetching achievements:', error);
		return json({ error: 'Failed to fetch achievements' }, { status: 500 });
	}
};
