import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumThreads, forumPosts, forumCategories, users } from '@/server/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { requireAuth, MAX_TITLE_LENGTH, MAX_POST_LENGTH } from '@/server/forum';
import { sensitiveRatelimit } from '@/server/ratelimit';

const EPOCH = new Date('2024-07-13T11:29:44.526Z').getTime();

function snowflake() {
	return String(new Snowflake({ custom_epoch: EPOCH }).getUniqueID());
}

// ---------------------------------------------------------------------------
// GET /api/forum/threads?category=general&sort=active|new|top&limit=&before=
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category');
	const sort = url.searchParams.get('sort') ?? 'active';
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);

	const replyCount = sql<number>`(
		select count(*) from forum_posts fp
		where fp.thread_id = forum_threads.id and fp.deleted = false
	)`.as('reply_count');

	const score = sql<number>`(
		select coalesce(sum(v.value), 0)
		from forum_post_votes v
		join forum_posts p on p.id = v.post_id
		where p.thread_id = forum_threads.id
	)`.as('score');

	const orderBy =
		sort === 'new'
			? [desc(forumThreads.pinned), desc(forumThreads.created_at)]
			: sort === 'top'
				? [desc(forumThreads.pinned), desc(score)]
				: [desc(forumThreads.pinned), desc(forumThreads.last_activity_at)];

	const query = db
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
			replyCount,
			score
		})
		.from(forumThreads)
		.leftJoin(users, eq(users.id, forumThreads.user_id))
		.where(category ? eq(forumThreads.category_id, category) : undefined)
		.orderBy(...orderBy)
		.limit(limit);

	const threads = await query;
	return json(threads);
};

// ---------------------------------------------------------------------------
// POST /api/forum/threads  { categoryId, title, content }
// ---------------------------------------------------------------------------
export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;

	const { success } = await sensitiveRatelimit.limit(auth.userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	const { categoryId, title, content } = body;

	if (!categoryId || typeof categoryId !== 'string')
		return json({ error: 'Missing categoryId' }, { status: 400 });
	if (!title || typeof title !== 'string' || title.trim().length < 3 || title.length > MAX_TITLE_LENGTH)
		return json({ error: `Title must be between 3 and ${MAX_TITLE_LENGTH} characters` }, { status: 400 });
	if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > MAX_POST_LENGTH)
		return json({ error: `Content must be between 1 and ${MAX_POST_LENGTH} characters` }, { status: 400 });

	const [category] = await db
		.select({ id: forumCategories.id })
		.from(forumCategories)
		.where(eq(forumCategories.id, categoryId))
		.limit(1);
	if (!category) return json({ error: 'Unknown category' }, { status: 400 });

	const threadId = snowflake();
	const postId = snowflake();

	await db.transaction(async (trx) => {
		await trx.insert(forumThreads).values({
			id: threadId,
			category_id: categoryId,
			user_id: auth.userId,
			title: title.trim()
		});

		await trx.insert(forumPosts).values({
			id: postId,
			thread_id: threadId,
			user_id: auth.userId,
			content,
			is_op: true
		});
	});

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
			verified: users.verified
		})
		.from(forumThreads)
		.leftJoin(users, eq(users.id, forumThreads.user_id))
		.where(eq(forumThreads.id, threadId))
		.limit(1);

	return json({ ...thread, firstPostId: postId }, { status: 201 });
};
