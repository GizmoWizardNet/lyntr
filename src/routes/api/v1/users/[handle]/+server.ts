import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { users, followers } from '@/server/schema';
import { eq, and, count } from 'drizzle-orm';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const handle = params.handle!;

	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			handle: users.handle,
			bio: users.bio,
			iq: users.iq,
			created_at: users.created_at,
			verified: users.verified,
			contributor: users.contributor
		})
		.from(users)
		.where(eq(users.handle, handle))
		.limit(1);

	if (!user) return json({ error: 'User not found' }, { status: 404 });

	const [{ followerCount }] = await db
		.select({ followerCount: count() })
		.from(followers)
		.where(eq(followers.user_id, user.id));

	const [{ followingCount }] = await db
		.select({ followingCount: count() })
		.from(followers)
		.where(eq(followers.follower_id, user.id));

	const [viewerFollows] = await db
		.select({ id: followers.user_id })
		.from(followers)
		.where(and(eq(followers.user_id, user.id), eq(followers.follower_id, auth.userId)))
		.limit(1);

	return json({
		...user,
		follower_count: followerCount,
		following_count: followingCount,
		followed_by_viewer: !!viewerFollows
	});
};
