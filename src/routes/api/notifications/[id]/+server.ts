import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { notifications } from '@/server/schema';
import { and, eq } from 'drizzle-orm';

export const PATCH: RequestHandler = async ({ params, cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return json({ error: 'Missing authentication' }, { status: 401 });

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		if (!jwtPayload.userId) throw new Error('Invalid JWT token');

		const userId = jwtPayload.userId;
		const id = params.id;
		if (!id) return json({ error: 'Missing notification id' }, { status: 400 });

		// Scoped to userId so nobody can mark someone else's notification read
		// (or use this to probe which notification ids exist).
		const result = await db
			.update(notifications)
			.set({ read: true })
			.where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
			.returning({ id: notifications.id });

		if (result.length === 0) return json({ error: 'Notification not found' }, { status: 404 });

		return json({ message: 'Notification marked as read' }, { status: 200 });
	} catch (error) {
		console.error('Error updating notification:', error);
		return json({ error: 'Failed to update notification' }, { status: 500 });
	}
};