import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { lynts, users, likes } from '@/server/schema';
import { eq, gte, sql, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ request }) => {
	if (request.headers.get('Authorization') !== process.env.ADMIN_KEY)
		return json({ error: 'Unauthorized' }, { status: 401 });

	const yesterday = new Date(Date.now() - 86_400_000);

	const results = await db
		.select({
			id: lynts.id,
			content: lynts.content,
			handle: users.handle,
			username: users.username,
			createdAt: lynts.created_at,
			has_image: lynts.has_image,
			likeCount:    sql<number>`(select count(*) from ${likes} where lynt_id = ${lynts.id})`.as('like_count'),
			commentCount: sql<number>`(select count(*) from ${lynts} as c where c.parent = ${lynts.id} and c.reposted = false)`.as('comment_count'),
			repostCount:  sql<number>`(select count(*) from ${lynts} as r where r.parent = ${lynts.id} and r.reposted = true)`.as('repost_count'),
		})
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(gte(lynts.created_at, yesterday))
		.orderBy(sql`like_count desc`)
		.limit(1);

	if (!results.length) return json({ error: 'No lynts found' }, { status: 404 });
	return json(results[0]);
};
