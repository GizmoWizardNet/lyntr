import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { followers } from '@/server/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuthJWT } from '@/server/jwt';
import { createNotification } from '@/server/notifications';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { evaluateAchievements } from '@/server/achievements';
import { recalcAura } from '@/server/aura';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await verifyAuthJWT(token);
	if (!payload) {
		return json({ error: 'Invalid token' }, { status: 401 });
	}

	const { userId: authenticatedUserId } = payload;
	const { userId: targetUserId } = await request.json();

	const { success } = await sensitiveRatelimit.limit(authenticatedUserId);

	if (!success) {
		return json({ error: 'You are ratelimited.' }, { status: 429 });
	}

	if (authenticatedUserId === targetUserId) {
		return json({ error: 'Cannot follow yourself' }, { status: 400 });
	}

	try {
		// Atomic toggle: instead of SELECT-then-INSERT/DELETE (which races
		// under rapid double-clicks or a slow connection — two concurrent
		// requests can both see "not following" and both insert, or both
		// see "following" and both delete), we rely on the followers table's
		// composite primary key (user_id, follower_id) and let a single
		// statement decide the outcome atomically.
		//
		// INSERT ... ON CONFLICT DO NOTHING tells us via rowCount whether a
		// row was actually inserted. If it wasn't (conflict = already
		// following), we know to delete instead. Both branches are single
		// statements, so there's no window for a second request to
		// interleave and desync the table from what the UI shows.
		const inserted = await db
			.insert(followers)
			.values({
				user_id: targetUserId,
				follower_id: authenticatedUserId
			})
			.onConflictDoNothing()
			.returning();

		if (inserted.length > 0) {
			await createNotification(targetUserId, 'follow', authenticatedUserId);
			// Follower-count achievements/Aura don't go through awardCoins
			// (following someone doesn't pay out Community XP), so this is
			// the one spot that needs its own explicit trigger. Fire-and-
			// forget, same reasoning as the awardCoins hook.
			evaluateAchievements(targetUserId).catch((err) =>
				console.error('Achievement evaluation error (non-fatal):', err)
			);
			recalcAura(targetUserId).catch((err) =>
				console.error('Aura recalculation error (non-fatal):', err)
			);
			return json({ message: 'Followed successfully' });
		}

		// Already following (the insert hit the conflict) — unfollow.
		await db
			.delete(followers)
			.where(
				and(eq(followers.user_id, targetUserId), eq(followers.follower_id, authenticatedUserId))
			)
			.execute();

		return json({ message: 'Unfollowed successfully' });
	} catch (error) {
		console.error('Error in follow/unfollow:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await verifyAuthJWT(token);
	if (!payload) {
		return json({ error: 'Invalid token' }, { status: 401 });
	}

	const { userId: authenticatedUserId } = payload;
	const targetUserId = url.searchParams.get('userId');

	if (!targetUserId) {
		return json({ error: 'Missing userId parameter' }, { status: 400 });
	}

	if (authenticatedUserId === targetUserId) {
		return json({ error: 'Cannot check follow status with yourself' }, { status: 409 });
	}

	try {
		const [isFollowing, isFollowedBy] = await Promise.all([
			db
				.select()
				.from(followers)
				.where(
					and(eq(followers.user_id, targetUserId), eq(followers.follower_id, authenticatedUserId))
				)
				.execute(),
			db
				.select()
				.from(followers)
				.where(
					and(eq(followers.user_id, authenticatedUserId), eq(followers.follower_id, targetUserId))
				)
				.execute()
		]);

		return json({
			isFollowing: isFollowing.length > 0,
			isFollowedBy: isFollowedBy.length > 0
		});
	} catch (error) {
		console.error('Error checking follow status:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
