import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { notifications, users, lynts, forumThreads, clanLynts } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);

		if (!jwtPayload.userId) {
			throw new Error('Invalid JWT token');
		}

		const userId = jwtPayload.userId;

		const userNotifications = await db
			.select({
				id: notifications.id,
				type: notifications.type,
				sourceUserId: notifications.sourceUserId,
				sourceUser: users.username,
				sourceUserHandle: users.handle,
				sourceUserIq: users.iq,
				sourceUserVerified: users.verified,
				sourceUserNameColor: users.name_color,
				sourceUserCreatedAt: users.created_at,
				sourceUserBio: users.bio,
				lyntContent: lynts.content,
				lyntId: notifications.lyntId,
				forumPostId: notifications.forumPostId,
				forumThreadId: notifications.forumThreadId,
				forumThreadTitle: forumThreads.title,
				// clan_invite / clan_declined only — the draft text and
				// whether it's still this recipient's turn to act on it.
				clanLyntId: notifications.clanLyntId,
				clanLyntContent: clanLynts.content,
				clanLyntStatus: clanLynts.status,
				read: notifications.read,
				createdAt: notifications.createdAt,
				mentionCount: notifications.mentionCount
			})
			.from(notifications)
			.leftJoin(users, eq(notifications.sourceUserId, users.id))
			.leftJoin(lynts, eq(notifications.lyntId, lynts.id))
			.leftJoin(forumThreads, eq(notifications.forumThreadId, forumThreads.id))
			.leftJoin(clanLynts, eq(notifications.clanLyntId, clanLynts.id))
			.where(eq(notifications.userId, userId))
			.orderBy(desc(notifications.createdAt))
			.limit(50);

		return json(userNotifications, { status: 200 });
	} catch (error) {
		console.error('Error fetching notifications:', error);
		return json({ error: 'Failed to fetch notifications' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);

		if (!jwtPayload.userId) {
			throw new Error('Invalid JWT token');
		}

		const userId = jwtPayload.userId;

		await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));

		return json({ message: 'All notifications marked as read' }, { status: 200 });
	} catch (error) {
		console.error('Error updating notifications:', error);
		return json({ error: 'Failed to update notifications' }, { status: 500 });
	}
};
