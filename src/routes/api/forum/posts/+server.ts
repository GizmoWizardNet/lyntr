import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumPosts, forumThreads, users, followers } from '@/server/schema';
import { eq, sql } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { requireAuth, MAX_POST_LENGTH, postScore, postUpvotes, postDownvotes } from '@/server/forum';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { createNotification } from '@/server/notifications';

const EPOCH = new Date('2024-07-13T11:29:44.526Z').getTime();

// ---------------------------------------------------------------------------
// POST /api/forum/posts  { threadId, content }
// ---------------------------------------------------------------------------
export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;

	const { success } = await sensitiveRatelimit.limit(auth.userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	const { threadId, content } = body;
	if (!threadId || typeof threadId !== 'string')
		return json({ error: 'Missing threadId' }, { status: 400 });
	if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > MAX_POST_LENGTH)
		return json({ error: `Content must be between 1 and ${MAX_POST_LENGTH} characters` }, { status: 400 });

	const [thread] = await db
		.select({ id: forumThreads.id, closed: forumThreads.closed, userId: forumThreads.user_id })
		.from(forumThreads)
		.where(eq(forumThreads.id, threadId))
		.limit(1);

	if (!thread) return json({ error: 'Thread not found' }, { status: 404 });
	if (thread.closed && !auth.isAdmin)
		return json({ error: 'This thread is closed.' }, { status: 403 });

	const postId = String(new Snowflake({ custom_epoch: EPOCH }).getUniqueID());

	await db.transaction(async (trx) => {
		await trx.insert(forumPosts).values({
			id: postId,
			thread_id: threadId,
			user_id: auth.userId,
			content
		});

		await trx
			.update(forumThreads)
			.set({ last_activity_at: sql`now()` })
			.where(eq(forumThreads.id, threadId));
	});

	const [newPost] = await db
		.select({
			id: forumPosts.id,
			threadId: forumPosts.thread_id,
			content: forumPosts.content,
			isOp: forumPosts.is_op,
			createdAt: forumPosts.created_at,
			editedAt: forumPosts.edited_at,
			deleted: forumPosts.deleted,
			userId: forumPosts.user_id,
			handle: users.handle,
			username: users.username,
			verified: users.verified,
			isAdmin: users.is_admin,
			contributor: users.contributor,
			loginStreak: users.login_streak,
			nameColor: users.name_color,
			score: postScore,
			upvotes: postUpvotes,
			downvotes: postDownvotes
		})
		.from(forumPosts)
		.leftJoin(users, eq(users.id, forumPosts.user_id))
		.where(eq(forumPosts.id, postId))
		.limit(1);

	// Notify the thread owner about this reply — skip self-replies.
	if (thread.userId && thread.userId !== auth.userId) {
		await createNotification(
			thread.userId,
			'forum_reply',
			auth.userId,
			undefined,
			postId,
			threadId
		);
	}

	return json({ ...newPost, viewerVote: 0 }, { status: 201 });
};
