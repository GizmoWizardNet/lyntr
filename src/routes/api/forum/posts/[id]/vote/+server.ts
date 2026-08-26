import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumPosts, forumPostVotes } from '@/server/schema';
import { and, eq } from 'drizzle-orm';
import { requireAuth, postScore, postUpvotes, postDownvotes } from '@/server/forum';
import { normalRatelimit } from '@/server/ratelimit';
import { createNotification } from '@/server/notifications';

// ---------------------------------------------------------------------------
// POST /api/forum/posts/[id]/vote  { value: 1 | -1 | 0 }
// 0 clears the viewer's existing vote (toggle-off).
// ---------------------------------------------------------------------------
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;

	const { success } = await normalRatelimit.limit(auth.userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const postId = params.id!;
	const body = await request.json().catch(() => null);
	const value = body?.value;

	if (![1, -1, 0].includes(value))
		return json({ error: 'value must be 1, -1, or 0' }, { status: 400 });

	const [post] = await db
		.select({ id: forumPosts.id, deleted: forumPosts.deleted, userId: forumPosts.user_id, threadId: forumPosts.thread_id })
		.from(forumPosts)
		.where(eq(forumPosts.id, postId))
		.limit(1);

	if (!post) return json({ error: 'Post not found' }, { status: 404 });
	if (post.deleted) return json({ error: 'Cannot vote on a deleted post' }, { status: 403 });

	const [existingVote] = await db
		.select({ value: forumPostVotes.value })
		.from(forumPostVotes)
		.where(and(eq(forumPostVotes.post_id, postId), eq(forumPostVotes.user_id, auth.userId)))
		.limit(1);

	if (value === 0) {
		await db
			.delete(forumPostVotes)
			.where(and(eq(forumPostVotes.post_id, postId), eq(forumPostVotes.user_id, auth.userId)));
	} else {
		await db
			.insert(forumPostVotes)
			.values({ post_id: postId, user_id: auth.userId, value })
			.onConflictDoUpdate({
				target: [forumPostVotes.post_id, forumPostVotes.user_id],
				set: { value, voted_at: new Date() }
			});

		// Only notify on an actual new/changed vote, not on repeat clicks of
		// the same value, and never for self-votes.
		if (existingVote?.value !== value && post.userId && post.userId !== auth.userId) {
			await createNotification(
				post.userId,
				value === 1 ? 'forum_upvote' : 'forum_downvote',
				auth.userId,
				undefined,
				postId,
				post.threadId
			);
		}
	}

	const [result] = await db
		.select({ score: postScore, upvotes: postUpvotes, downvotes: postDownvotes })
		.from(forumPosts)
		.where(eq(forumPosts.id, postId))
		.limit(1);

	return json({ postId, viewerVote: value, ...result });
};
