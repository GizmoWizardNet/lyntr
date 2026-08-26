import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { pinAchievement } from '@/server/achievements';
 
export const PATCH: RequestHandler = async ({ cookies, request }) => {
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
		// key: null (or omitted) unpins; a string pins that achievement.
		const key = typeof body?.key === 'string' ? body.key : null;
 
		const result = await pinAchievement(userId, key);
 
		if (!result.ok) {
			const status = result.error === 'unknown_achievement' ? 404 : 409;
			return json({ error: result.error }, { status });
		}
 
		return json({ pinned: key });
	} catch (error) {
		console.error('Error pinning achievement:', error);
		return json({ error: 'Failed to pin achievement' }, { status: 500 });
	}
};
