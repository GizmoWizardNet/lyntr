import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumThreads, forumPosts, forumCategories, users } from '@/server/schema';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// GET /api/forum/search?q=...
// Returns matching threads (by title) and matching posts (by content),
// each with enough context to deep-link back into the thread view.
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 2) return json({ threads: [], posts: [] });

	const like = `%${q}%`;

	const threads = await db
		.select({
			id: forumThreads.id,
			title: forumThreads.title,
			categoryId: forumThreads.category_id,
			createdAt: forumThreads.created_at,
			closed: forumThreads.closed,
			handle: users.handle,
			username: users.username
		})
		.from(forumThreads)
		.leftJoin(users, eq(users.id, forumThreads.user_id))
		.where(ilike(forumThreads.title, like))
		.orderBy(desc(forumThreads.last_activity_at))
		.limit(20);

	const posts = await db
		.select({
			id: forumPosts.id,
			threadId: forumPosts.thread_id,
			content: forumPosts.content,
			createdAt: forumPosts.created_at,
			isOp: forumPosts.is_op,
			threadTitle: forumThreads.title,
			categoryId: forumThreads.category_id,
			handle: users.handle,
			username: users.username
		})
		.from(forumPosts)
		.innerJoin(forumThreads, eq(forumThreads.id, forumPosts.thread_id))
		.leftJoin(users, eq(users.id, forumPosts.user_id))
		.where(and(ilike(forumPosts.content, like), eq(forumPosts.deleted, false)))
		.orderBy(desc(forumPosts.created_at))
		.limit(20);

	return json({ threads, posts });
};
