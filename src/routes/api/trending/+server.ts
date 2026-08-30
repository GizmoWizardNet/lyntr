import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@/server/db';
import { lynts, lyntHashtags, likes, users, followers } from '@/server/schema';
import { sql, inArray } from 'drizzle-orm';
import { verifyAuthJWT } from '@/server/jwt';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		/*
		 * Trending tags
		 *
		 * Count unique Lynts using each tag during the last 7 days.
		 * We use lynts.created_at rather than lynt_hashtags.created_at
		 * because hashtag rows are recreated whenever a Lynt is edited.
		 */
		const trendingTags = await db
			.select({
				tag: lyntHashtags.tag,
				count: sql<number>`count(distinct ${lyntHashtags.lynt_id})`
			})
			.from(lyntHashtags)
			.innerJoin(lynts, sql`${lynts.id} = ${lyntHashtags.lynt_id}`)
			.where(sql`
				${lynts.created_at} >= now() - interval '7 days'
			`)
			.groupBy(lyntHashtags.tag)
			.orderBy(sql`count(distinct ${lyntHashtags.lynt_id}) desc`)
			.limit(5);

		/*
		 * Trending users
		 *
		 * Score:
		 *   +1 per Lynt posted in the last 7 days
		 *   +3 per like received on those Lynts
		 *
		 * Likes are LEFT JOINed so users can still trend from posting
		 * even if their posts have no likes.
		 *
		 * COUNT(DISTINCT lynts.id) prevents the likes join from making
		 * one Lynt count multiple times.
		 */
		const trendingUsers = await db
			.select({
				id: users.id,
				username: users.username,
				handle: users.handle,
				verified: users.verified,
				nameColor: users.name_color,
				isAdmin: users.is_admin,
				contributor: users.contributor,
				loginStreak: users.login_streak,

				postCount: sql<number>`
					count(distinct ${lynts.id})
				`,

				likeCount: sql<number>`
					count(${likes.user_id})
				`,

				score: sql<number>`
					(
						count(distinct ${lynts.id})
						+
						(count(${likes.user_id}) * 3)
					)
				`
			})
			.from(users)
			.innerJoin(
				lynts,
				sql`${lynts.user_id} = ${users.id}`
			)
			.leftJoin(
				likes,
				sql`
					${likes.lynt_id} = ${lynts.id}
					and ${likes.liked_at} >= now() - interval '7 days'
				`
			)
			.where(sql`
				${lynts.created_at} >= now() - interval '7 days'
				and ${users.banned} = false
			`)
			.groupBy(
				users.id,
				users.username,
				users.handle,
				users.verified,
				users.name_color,
				users.is_admin,
				users.contributor,
				users.login_streak
			)
			.orderBy(sql`
				(
					count(distinct ${lynts.id})
					+
					(count(${likes.user_id}) * 3)
				) desc
			`)
			.limit(3);

		// Figure out who's asking, so we can flag who they already follow
		// and who follows them back — same badges/CTA logic as the profile page.
		let viewerId: string | null = null;
		const token = cookies.get('_TOKEN__DO_NOT_SHARE');
		if (token) {
			const payload = await verifyAuthJWT(token);
			if (payload) viewerId = payload.userId;
		}

		const trendingUserIds = trendingUsers.map((u) => u.id);

		// Follower counts for each trending user (how many people follow them).
		const followerCounts = trendingUserIds.length
			? await db
					.select({
						userId: followers.user_id,
						count: sql<number>`count(*)`
					})
					.from(followers)
					.where(inArray(followers.user_id, trendingUserIds))
					.groupBy(followers.user_id)
			: [];
		const followerCountMap = new Map(
			followerCounts.map((f) => [f.userId, Number(f.count)])
		);

		// Viewer's relationship to each trending user: are we following them,
		// and do they follow us back.
		let followingSet = new Set<string>();
		let followedBySet = new Set<string>();
		if (viewerId && trendingUserIds.length) {
			const [following, followedBy] = await Promise.all([
				db
					.select({ userId: followers.user_id })
					.from(followers)
					.where(
						sql`${followers.follower_id} = ${viewerId} and ${followers.user_id} in ${trendingUserIds}`
					),
				db
					.select({ userId: followers.follower_id })
					.from(followers)
					.where(
						sql`${followers.user_id} = ${viewerId} and ${followers.follower_id} in ${trendingUserIds}`
					)
			]);
			followingSet = new Set(following.map((f) => f.userId));
			followedBySet = new Set(followedBy.map((f) => f.userId));
		}

		return json({
			tags: trendingTags.map((tag) => ({
				tag: tag.tag,
				count: Number(tag.count)
			})),

			users: trendingUsers.map((user) => ({
				...user,
				postCount: Number(user.postCount),
				likeCount: Number(user.likeCount),
				score: Number(user.score),
				followerCount: followerCountMap.get(user.id) ?? 0,
				isFollowing: followingSet.has(user.id),
				followsViewer: followedBySet.has(user.id),
				isSelf: viewerId === user.id
			}))
		});
	} catch (error) {
		console.error('[trending] Failed to load trending data:', error);

		return json(
			{ error: 'Failed to load trending data' },
			{ status: 500 }
		);
	}
};