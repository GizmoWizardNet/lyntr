import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { userAchievements } from '@/server/schema';
import { eq, and, isNull, count } from 'drizzle-orm';

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

		const unseenCountResult = await db
			.select({ count: count() })
			.from(userAchievements)
			.where(and(eq(userAchievements.user_id, userId), isNull(userAchievements.seen_at)));

		return json(unseenCountResult[0] || { count: 0 }, { status: 200 });
	} catch (error) {
		console.error('Error fetching unseen achievements:', error);
		return json({ error: 'Failed to fetch unseen achievements' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ cookies }) => {
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

		await db
			.update(userAchievements)
			.set({ seen_at: new Date() })
			.where(and(eq(userAchievements.user_id, userId), isNull(userAchievements.seen_at)));

		return json({ message: 'All achievements marked as seen' }, { status: 200 });
	} catch (error) {
		console.error('Error marking achievements as seen:', error);
		return json({ error: 'Failed to update achievements' }, { status: 500 });
	}
};
