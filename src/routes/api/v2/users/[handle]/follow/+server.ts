import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { users, followers } from '@/server/schema';
import { eq, and } from 'drizzle-orm';
import { createNotification } from '@/server/notifications';

async function resolveTarget(handle: string) {
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
	return user ?? null;
}

export const POST: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const target = await resolveTarget(params.handle!);
	if (!target) return json({ error: 'User not found' }, { status: 404 });
	if (target.id === auth.userId) return json({ error: 'Cannot follow yourself' }, { status: 400 });

	const [existing] = await db
		.select()
		.from(followers)
		.where(and(eq(followers.user_id, target.id), eq(followers.follower_id, auth.userId)))
		.limit(1);

	if (existing) return json({ following: true, message: 'Already following.' });

	await db.insert(followers).values({ user_id: target.id, follower_id: auth.userId });

	try {
		await createNotification(target.id, 'follow', auth.userId);
	} catch (e) {
		console.error('v2 follow notification error:', e);
	}

	return json({ following: true });
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const target = await resolveTarget(params.handle!);
	if (!target) return json({ error: 'User not found' }, { status: 404 });

	await db
		.delete(followers)
		.where(and(eq(followers.user_id, target.id), eq(followers.follower_id, auth.userId)));

	return json({ following: false });
};
