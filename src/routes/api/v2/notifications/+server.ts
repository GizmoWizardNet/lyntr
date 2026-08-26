import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { notifications, users, lynts } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ request }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const result = await db
		.select({
			id: notifications.id,
			type: notifications.type,
			sourceUserId: notifications.sourceUserId,
			sourceUserHandle: users.handle,
			sourceUsername: users.username,
			lyntId: notifications.lyntId,
			lyntContent: lynts.content,
			read: notifications.read,
			createdAt: notifications.createdAt,
			mentionCount: notifications.mentionCount
		})
		.from(notifications)
		.leftJoin(users, eq(notifications.sourceUserId, users.id))
		.leftJoin(lynts, eq(notifications.lyntId, lynts.id))
		.where(eq(notifications.userId, auth.userId))
		.orderBy(desc(notifications.createdAt))
		.limit(50);

	return json({ notifications: result });
};
