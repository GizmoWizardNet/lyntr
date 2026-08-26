import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumPosts } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, MAX_POST_LENGTH } from '@/server/forum';

// ---------------------------------------------------------------------------
// PATCH /api/forum/posts/[id]  { content } — author only, edits in place
// ---------------------------------------------------------------------------
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;

	const postId = params.id!;
	const body = await request.json().catch(() => null);
	if (!body || typeof body.content !== 'string')
		return json({ error: 'Invalid body' }, { status: 400 });

	const content = body.content;
	if (content.trim().length === 0 || content.length > MAX_POST_LENGTH)
		return json({ error: `Content must be between 1 and ${MAX_POST_LENGTH} characters` }, { status: 400 });

	const [post] = await db
		.select({ id: forumPosts.id, userId: forumPosts.user_id, deleted: forumPosts.deleted })
		.from(forumPosts)
		.where(eq(forumPosts.id, postId))
		.limit(1);

	if (!post) return json({ error: 'Post not found' }, { status: 404 });
	if (post.deleted) return json({ error: 'Cannot edit a deleted post' }, { status: 403 });
	if (post.userId !== auth.userId)
		return json({ error: 'You can only edit your own posts' }, { status: 403 });

	const [updated] = await db
		.update(forumPosts)
		.set({ content, edited_at: new Date() })
		.where(eq(forumPosts.id, postId))
		.returning({ id: forumPosts.id, content: forumPosts.content, editedAt: forumPosts.edited_at });

	return json(updated);
};

// ---------------------------------------------------------------------------
// DELETE /api/forum/posts/[id] — author OR admin (moderation). Soft-delete.
// ---------------------------------------------------------------------------
export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;

	const postId = params.id!;

	const [post] = await db
		.select({ id: forumPosts.id, userId: forumPosts.user_id })
		.from(forumPosts)
		.where(eq(forumPosts.id, postId))
		.limit(1);

	if (!post) return json({ error: 'Post not found' }, { status: 404 });
	if (post.userId !== auth.userId && !auth.isAdmin)
		return json({ error: 'Not allowed' }, { status: 403 });

	await db
		.update(forumPosts)
		.set({ deleted: true, deleted_by: auth.userId, deleted_at: new Date() })
		.where(eq(forumPosts.id, postId));

	return json({ id: postId, deleted: true });
};
