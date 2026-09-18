import type { Cookies } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { awardStreakBonus } from '@/server/lyntcoins';
import { verifyDesktopAuthToken } from '@/server/desktopAuth';

export type CurrentUser = {
	id: string;
	username: string;
	handle: string;
	created_at: unknown;
	iq: number;
	login_streak: number;
	is_admin: boolean;
	lynt_coins: number;
	default_feed: string | null;
	custom_font: string | null;
};

export async function getCurrentUser(
	request: Request,
	cookies: Cookies
): Promise<CurrentUser | null> {
	try {
		let userId: string;

		const authorization = request.headers.get('authorization');

		if (authorization?.startsWith('Bearer ')) {
			const desktopToken = authorization.slice('Bearer '.length).trim();
			const desktopPayload = await verifyDesktopAuthToken(desktopToken);
			if (!desktopPayload?.userId) return null;
			userId = desktopPayload.userId;
		} else {
			const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
			if (!authCookie) return null;

			const jwtPayload = await verifyAuthJWT(authCookie);
			if (!jwtPayload.userId) return null;
			userId = jwtPayload.userId;
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
				default_feed: users.default_feed,
				custom_font: users.custom_font
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) return null;

		// ── Streak logic (unchanged from the old /api/me handler) ──
		const todayUTC = new Date().toISOString().slice(0, 10);
		const lastLogin = user.last_login_date;

		let newStreak = user.login_streak;
		let lyntCoins = user.lynt_coins;

		if (lastLogin !== todayUTC) {
			const yesterday = new Date();
			yesterday.setUTCDate(yesterday.getUTCDate() - 1);
			const yesterdayUTC = yesterday.toISOString().slice(0, 10);

			newStreak = lastLogin === yesterdayUTC ? user.login_streak + 1 : 1;

			await db
				.update(users)
				.set({ login_streak: newStreak, last_login_date: todayUTC })
				.where(eq(users.id, user.id));

			try {
				const streakAward = await awardStreakBonus(user.id, newStreak);
				if (streakAward?.awarded) lyntCoins += streakAward.awarded;
			} catch (lcError) {
				console.error('LyntCoins award error (streak):', lcError);
			}
		}

		return {
			id: user.id,
			username: user.username,
			handle: user.handle,
			created_at: user.created_at,
			iq: user.iq,
			login_streak: newStreak,
			is_admin: user.is_admin,
			lynt_coins: lyntCoins,
			default_feed: user.default_feed,
			custom_font: user.custom_font
		};
	} catch (error) {
		console.error('Authentication error:', error);
		return null;
	}
}
