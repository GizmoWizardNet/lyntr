import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { forumCategories } from '@/server/schema';
import { sql } from 'drizzle-orm';

// Note: written with explicit table aliases (ft/fp) rather than interpolating
// bare Table/Column objects. forum_threads, forum_posts, and forum_categories
// all have an `id` column, and letting the query builder auto-qualify them
// inside nested correlated subqueries produced "column reference id is
// ambiguous" from Postgres.
export const GET: RequestHandler = async () => {
	const threadCount = sql<number>`(
		select count(*) from forum_threads ft
		where ft.category_id = forum_categories.id
	)`.as('thread_count');

	const postCount = sql<number>`(
		select count(*)
		from forum_posts fp
		join forum_threads ft on ft.id = fp.thread_id
		where ft.category_id = forum_categories.id and fp.deleted = false
	)`.as('post_count');

	const lastActivityAt = sql<string | null>`(
		select max(ft.last_activity_at) from forum_threads ft
		where ft.category_id = forum_categories.id
	)`.as('last_activity_at');

	const categories = await db
		.select({
			id: forumCategories.id,
			name: forumCategories.name,
			description: forumCategories.description,
			sortOrder: forumCategories.sort_order,
			threadCount,
			postCount,
			lastActivityAt
		})
		.from(forumCategories)
		.orderBy(forumCategories.sort_order);

	return json(categories);
};
