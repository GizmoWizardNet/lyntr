import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq, sql } from 'drizzle-orm';
import { awardStreakBonus } from '@/server/lyntcoins';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);

		if (!jwtPayload.userId) {
			throw new Error('Invalid JWT token');
		}

		const [user] = await db
			.select({
				id: users.id,
				username: users.username,
				handle: users.handle,
				created_at: users.created_at,
				iq: users.iq,
				login_streak: users.login_streak,
				last_login_date: users.last_login_date,
				is_admin: users.is_admin,
				lynt_coins: users.lynt_coins,
				default_feed: users.default_feed
			})
			.from(users)
			.where(eq(users.id, jwtPayload.userId))
			.limit(1);

		if (!user) {
			return json({ error: 'User not found' }, { status: 403 });
		}

		// ── Streak logic ─────────────────────────────────────────
		// Compare dates in UTC to avoid timezone drift.
		const todayUTC = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
		const lastLogin = user.last_login_date; // already a "YYYY-MM-DD" string from Postgres date column

		let newStreak = user.login_streak;

		let lyntCoins = user.lynt_coins;

		if (lastLogin !== todayUTC) {
			// Check if last login was yesterday — if so, increment; otherwise reset to 1
			const yesterday = new Date();
			yesterday.setUTCDate(yesterday.getUTCDate() - 1);
			const yesterdayUTC = yesterday.toISOString().slice(0, 10);

			if (lastLogin === yesterdayUTC) {
				newStreak = user.login_streak + 1;
			} else {
				newStreak = 1; // missed a day — reset
			}

			await db
				.update(users)
				.set({
					login_streak: newStreak,
					last_login_date: todayUTC
				})
				.where(eq(users.id, user.id));

			try {
				const streakAward = await awardStreakBonus(user.id, newStreak);
				if (streakAward?.awarded) lyntCoins += streakAward.awarded;
			} catch (lcError) {
				console.error('LyntCoins award error (streak):', lcError);
			}
		}

		return json(
			{
				id: user.id,
				username: user.username,
				handle: user.handle,
				created_at: user.created_at,
				iq: user.iq,
				login_streak: newStreak,
				is_admin: user.is_admin,
				lynt_coins: lyntCoins,
				default_feed: user.default_feed
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Authentication error:', error);
		return json({ error: 'Authentication failed' }, { status: 401 });
	}
};
