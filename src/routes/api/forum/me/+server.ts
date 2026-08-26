import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumThreads, forumPosts, users } from '@/server/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAuth, postScore } from '@/server/forum';

// ---------------------------------------------------------------------------
// GET /api/forum/me — the logged-in user's own threads and posts/replies.
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;

	const threads = await db
		.select({
			id: forumThreads.id,
			title: forumThreads.title,
			categoryId: forumThreads.category_id,
			createdAt: forumThreads.created_at,
			closed: forumThreads.closed,
			pinned: forumThreads.pinned,
			views: forumThreads.views
		})
		.from(forumThreads)
		.where(eq(forumThreads.user_id, auth.userId))
		.orderBy(desc(forumThreads.created_at))
		.limit(50);

	const posts = await db
		.select({
			id: forumPosts.id,
			threadId: forumPosts.thread_id,
			content: forumPosts.content,
			isOp: forumPosts.is_op,
			createdAt: forumPosts.created_at,
			deleted: forumPosts.deleted,
			threadTitle: forumThreads.title,
			categoryId: forumThreads.category_id,
			score: postScore
		})
		.from(forumPosts)
		.innerJoin(forumThreads, eq(forumThreads.id, forumPosts.thread_id))
		.where(eq(forumPosts.user_id, auth.userId))
		.orderBy(desc(forumPosts.created_at))
		.limit(50);

	return json({ threads, posts });
};
