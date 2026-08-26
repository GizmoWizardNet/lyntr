import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumThreads, forumPosts, forumCategories, forumPostVotes, users } from '@/server/schema';
import { desc, eq, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// GET /api/forum/stats — global counters + the most-discussed thread and
// the most active poster, for a "forum stats" sidebar.
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async () => {
	const [[{ threadCount }], [{ postCount }], [{ voteCount }], [{ participantCount }]] = await Promise.all([
		db.select({ threadCount: sql<number>`count(*)` }).from(forumThreads),
		db.select({ postCount: sql<number>`count(*)` }).from(forumPosts).where(eq(forumPosts.deleted, false)),
		db.select({ voteCount: sql<number>`count(*)` }).from(forumPostVotes),
		db.select({ participantCount: sql<number>`count(distinct ${forumPosts.user_id})` }).from(forumPosts)
	]);

	const replyCount = sql<number>`(
		select count(*) from forum_posts fp
		where fp.thread_id = forum_threads.id and fp.deleted = false
	)`.as('reply_count');

	const mostDiscussed = await db
		.select({
			id: forumThreads.id,
			title: forumThreads.title,
			categoryId: forumThreads.category_id,
			replyCount
		})
		.from(forumThreads)
		.orderBy(desc(replyCount))
		.limit(1);

	const topPosters = await db
		.select({
			userId: forumPosts.user_id,
			handle: users.handle,
			username: users.username,
			postCount: sql<number>`count(*)`.as('post_count')
		})
		.from(forumPosts)
		.leftJoin(users, eq(users.id, forumPosts.user_id))
		.where(eq(forumPosts.deleted, false))
		.groupBy(forumPosts.user_id, users.handle, users.username)
		.orderBy(desc(sql`count(*)`))
		.limit(5);

	const categoryBreakdown = await db
		.select({
			id: forumCategories.id,
			name: forumCategories.name,
			threadCount: sql<number>`(
				select count(*) from forum_threads ft where ft.category_id = forum_categories.id
			)`
		})
		.from(forumCategories)
		.orderBy(forumCategories.sort_order);

	return json({
		threadCount,
		postCount,
		voteCount,
		participantCount,
		mostDiscussed: mostDiscussed[0] ?? null,
		topPosters,
		categoryBreakdown
	});
};
