import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { users, lynts, likes, history } from '@/server/schema';
import { sql, eq, gte } from 'drizzle-orm';

export const GET: RequestHandler = async ({ request }) => {
	if (request.headers.get('Authorization') !== process.env.ADMIN_KEY)
		return json({ error: 'Unauthorized' }, { status: 401 });

	const yesterday = new Date(Date.now() - 86_400_000);

	const [[totalUsers], [totalLynts], [totalLikes], [totalImages], [activeToday]] =
		await Promise.all([
			db.select({ count: sql<number>`count(*)` }).from(users),
			db.select({ count: sql<number>`count(*)` }).from(lynts),
			db.select({ count: sql<number>`count(*)` }).from(likes),
			db.select({ count: sql<number>`count(*)` }).from(lynts).where(eq(lynts.has_image, true)),
			db.select({ count: sql<number>`count(distinct ${history.user_id})` })
				.from(history)
				.where(gte(history.createdAt, yesterday)),
		]);

	return json({
		totalUsers:  Number(totalUsers.count),
		totalLynts:  Number(totalLynts.count),
		totalLikes:  Number(totalLikes.count),
		totalImages: Number(totalImages.count),
		activeToday: Number(activeToday.count),
	});
};
