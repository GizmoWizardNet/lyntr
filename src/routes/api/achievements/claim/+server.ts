import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { claimAchievement } from '@/server/achievements';

export const POST: RequestHandler = async ({ cookies, request }) => {
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

		const body = await request.json().catch(() => ({}));
		const key = body?.key;
		if (!key || typeof key !== 'string') {
			return json({ error: 'Missing achievement key' }, { status: 400 });
		}

		const result = await claimAchievement(userId, key);

		if (!result.ok) {
			const status = result.error === 'unknown_achievement' ? 404 : 409;
			return json({ error: result.error }, { status });
		}

		return json({ claimed: true, amount: result.amount });
	} catch (error) {
		console.error('Error claiming achievement:', error);
		return json({ error: 'Failed to claim achievement' }, { status: 500 });
	}
};
