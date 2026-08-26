import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumThreads, forumPosts, users, followers } from '@/server/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { authenticate, requireAuth, postScore, postUpvotes, postDownvotes, postViewerVote } from '@/server/forum';

// ---------------------------------------------------------------------------
// GET /api/forum/threads/[id] — thread metadata + all (non-deleted-for-non-
// admins) posts, oldest first (OP included as the first post).
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async ({ params, cookies }) => {
	const threadId = params.id!;

	// Auth here is optional — anyone can read the forum — but if a cookie is
	// present we use it to resolve the viewer's own vote on each post and
	// whether to show soft-deleted posts (admins see them, struck through).
	const auth = await authenticate(cookies);
	const userId = auth.ok ? auth.userId : null;
	const isAdmin = auth.ok ? auth.isAdmin : false;

	const [thread] = await db
		.select({
			id: forumThreads.id,
			title: forumThreads.title,
			categoryId: forumThreads.category_id,
			createdAt: forumThreads.created_at,
			lastActivityAt: forumThreads.last_activity_at,
			views: forumThreads.views,
			pinned: forumThreads.pinned,
			closed: forumThreads.closed,
			userId: forumThreads.user_id,
			handle: users.handle,
			username: users.username,
			verified: users.verified,
			nameColor: users.name_color
		})
		.from(forumThreads)
		.leftJoin(users, eq(users.id, forumThreads.user_id))
		.where(eq(forumThreads.id, threadId))
		.limit(1);

	if (!thread) return json({ error: 'Thread not found' }, { status: 404 });

	// Best-effort view bump — not gated behind a unique-per-viewer table,
	// matching the lightweight style of the existing visitor counter.
	await db
		.update(forumThreads)
		.set({ views: sql`${forumThreads.views} + 1` })
		.where(eq(forumThreads.id, threadId));

	const followerCount = sql<number>`(
		select count(*) from ${followers} where ${followers.user_id} = ${forumPosts.user_id}
	)`.as('follower_count');

	const followsViewer = userId
		? sql<boolean>`exists(
			select 1 from ${followers}
			where ${followers.follower_id} = ${forumPosts.user_id}
			  and ${followers.user_id}     = ${userId}
		)`.as('follows_viewer')
		: sql<boolean>`false`.as('follows_viewer');

	const posts = await db
		.select({
			id: forumPosts.id,
			threadId: forumPosts.thread_id,
			content: forumPosts.content,
			isOp: forumPosts.is_op,
			createdAt: forumPosts.created_at,
			editedAt: forumPosts.edited_at,
			deleted: forumPosts.deleted,
			deletedAt: forumPosts.deleted_at,
			userId: forumPosts.user_id,
			handle: users.handle,
			username: users.username,
			verified: users.verified,
			isAdmin: users.is_admin,
			contributor: users.contributor,
			loginStreak: users.login_streak,
			nameColor: users.name_color,
			followerCount,
			followsViewer,
			score: postScore,
			upvotes: postUpvotes,
			downvotes: postDownvotes,
			viewerVote: postViewerVote(userId)
		})
		.from(forumPosts)
		.leftJoin(users, eq(users.id, forumPosts.user_id))
		.where(eq(forumPosts.thread_id, threadId))
		.orderBy(asc(forumPosts.created_at));

	// Non-admins get deleted posts redacted (content stripped) rather than
	// removed entirely, so reply counts / "N posts" stay accurate.
	const sanitized = posts.map((p) =>
		p.deleted && !isAdmin ? { ...p, content: '[deleted by moderator]' } : p
	);

	return json({ thread, posts: sanitized, viewerIsAdmin: isAdmin });
};

// ---------------------------------------------------------------------------
// PATCH /api/forum/threads/[id]  { closed?, pinned? } — admin only
// ---------------------------------------------------------------------------
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Admin only' }, { status: 403 });

	const threadId = params.id!;
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	const update: Record<string, unknown> = {};
	if (typeof body.closed === 'boolean') {
		update.closed = body.closed;
		update.closed_by = body.closed ? auth.userId : null;
		update.closed_at = body.closed ? new Date() : null;
	}
	if (typeof body.pinned === 'boolean') {
		update.pinned = body.pinned;
	}

	if (Object.keys(update).length === 0)
		return json({ error: 'Nothing to update' }, { status: 400 });

	const [updated] = await db
		.update(forumThreads)
		.set(update)
		.where(eq(forumThreads.id, threadId))
		.returning({ id: forumThreads.id, closed: forumThreads.closed, pinned: forumThreads.pinned });

	if (!updated) return json({ error: 'Thread not found' }, { status: 404 });
	return json(updated);
};
