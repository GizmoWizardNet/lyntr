import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@/server/db';
import { lynts, lyntHashtags, likes, users } from '@/server/schema';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
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
				users.name_color
			)
			.orderBy(sql`
				(
					count(distinct ${lynts.id})
					+
					(count(${likes.user_id}) * 3)
				) desc
			`)
			.limit(3);

		return json({
			tags: trendingTags.map((tag) => ({
				tag: tag.tag,
				count: Number(tag.count)
			})),

			users: trendingUsers.map((user) => ({
				...user,
				postCount: Number(user.postCount),
				likeCount: Number(user.likeCount),
				score: Number(user.score)
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
