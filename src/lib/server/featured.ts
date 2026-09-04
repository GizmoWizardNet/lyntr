import { db } from '@/server/db';
import { lynts, users, likes } from '@/server/schema';
import { eq, gte, sql } from 'drizzle-orm';

export async function getFeaturedLynt() {
	const yesterday = new Date(Date.now() - 86_400_000);

	const results = await db
		.select({
			id: lynts.id,
			content: lynts.content,
			handle: users.handle,
			username: users.username,
			userId: users.id,
			nameColor: users.name_color,
			verified: users.verified,
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

	return results[0] ?? null;
}