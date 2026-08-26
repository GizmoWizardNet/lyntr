import { db } from '@/server/db';
import { notifications, users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { sendToUser } from '$lib/ws';
import { sendNotificationEmail } from '$lib/server/email';
import { sendPushNotification } from '$lib/server/push';

export async function createNotification(
	userId: string,
	type: string,
	sourceUserId: string,
	lyntId?: string,
	forumPostId?: string,
	forumThreadId?: string,
	// Extra context for richer email content — optional, existing callers
	// don't need to change their call signatures.
	extras?: {
		lyntContent?: string | null;
		forumThreadTitle?: string | null;
	},
	clanLyntId?: string
) {
	await db.insert(notifications).values({
		userId,
		type,
		sourceUserId,
		lyntId,
		forumPostId,
		forumThreadId,
		clanLyntId
	});

	sendToUser(userId, {
		type: 'notification',
		notificationType: type,
		sourceUserId,
		lyntId,
		forumPostId,
		forumThreadId,
		clanLyntId
	});

	// Email — fire-and-forget. Fetch actor name so we can populate the template.
	// Only runs if the recipient has email notifications enabled.
	try {
		const [actor] = await db
			.select({ username: users.username, handle: users.handle })
			.from(users)
			.where(eq(users.id, sourceUserId))
			.limit(1);

		if (actor) {
			// Email — fire and forget
			sendNotificationEmail({
				recipientId: userId,
				type,
				actorUsername: actor.username,
				actorHandle: actor.handle,
				lyntContent: extras?.lyntContent,
				lyntId,
				forumThreadTitle: extras?.forumThreadTitle,
				forumThreadId,
			}).catch(() => {});

			// Push — fire and forget
			sendPushNotification({
				recipientId: userId,
				type,
				actorUsername: actor.username,
				lyntContent: extras?.lyntContent,
				forumThreadTitle: extras?.forumThreadTitle,
			}).catch(() => {});
		}
	} catch {
		// Never let the email path break the notification
	}
}
