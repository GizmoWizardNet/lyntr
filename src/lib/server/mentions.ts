/**
 * src/lib/server/mentions.ts  –  @mention extraction & notification fan-out
 *
 * Used by:
 *   - src/routes/api/lynt/+server.ts     (POST: new lynt, PATCH: edit)
 *   - src/routes/api/comment/+server.ts  (POST: new comment)
 *
 * Behaviour:
 *   - Extracts @handle tokens from raw post text (same regex family the
 *     client uses for highlighting, kept in sync — see extractMentionHandles).
 *   - Resolves handles -> user IDs in one query.
 *   - Skips self-mentions (you can't notify yourself).
 *   - De-duplicates repeated mentions of the SAME user within one lynt
 *     ("@bob @bob @bob" -> one notification, not three) — handled simply by
 *     extracting a Set of unique handles before resolving.
 *   - De-duplicates ACROSS time too: re-mentioning the same user in the same
 *     lynt (e.g. after an edit) bumps mention_count + created_at + read=false
 *     on the EXISTING notification row rather than creating a new one, via
 *     an upsert against the partial unique index from migration 0005.
 */

import { db } from './db';
import { users, notifications } from './schema';
import { inArray, sql, eq } from 'drizzle-orm';
import { sendToUser } from '$lib/ws';
import { sendNotificationEmail } from './email';
import { sendPushNotification } from './push';

// Mirrors the client-side regex in ParsedContent.svelte (mentions.ts) —
// handles are [A-Za-z0-9_]{1,32}, must not be glued to a preceding word
// character (so "email@domain.com" is not parsed as a mention of "domain").
const MENTION_REGEX = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{1,32})(?![A-Za-z0-9_])/g;

/** Extract unique, lowercase-normalised handles mentioned in raw text. */
export function extractMentionHandles(text: string): string[] {
	if (!text) return [];
	const found = new Set<string>();
	let match: RegExpExecArray | null;
	// Reset lastIndex defensively since MENTION_REGEX is a module-level /g regex.
	MENTION_REGEX.lastIndex = 0;
	while ((match = MENTION_REGEX.exec(text)) !== null) {
		found.add(match[1].toLowerCase());
	}
	return Array.from(found);
}

/**
 * Resolve handles to user rows, create/bump mention notifications for each
 * (excluding the author themself), and push a live WS event to each
 * recipient. Call this after the lynt/comment row already exists in the DB.
 *
 * @param content   raw lynt/comment text
 * @param authorId  the user who wrote it (excluded from notification targets)
 * @param lyntId    the lynt/comment ID being mentioned-from
 */
export async function processMentions(content: string, authorId: string, lyntId: string) {
	const handles = extractMentionHandles(content);
	if (handles.length === 0) return;

	// Case-insensitive resolve: handles are stored as users entered them,
	// but mentions should match regardless of case typed in the post.
	const matchedUsers = await db
		.select({ id: users.id, handle: users.handle })
		.from(users)
		.where(sql`lower(${users.handle}) in (${sql.join(handles.map((h) => sql`${h}`), sql`, `)})`);

	const recipientIds = matchedUsers
		.map((u) => u.id)
		.filter((id) => id !== authorId); // no self-notifications

	if (recipientIds.length === 0) return;

	// This upsert loop inserted the notification row and pushed a live WS
	// event, but never sent email/push — mention emails simply never went
	// out. Fetch the author once and fire both off per recipient, same as
	// createNotification() does for every other notif type.
	const [author] = await db
		.select({ username: users.username, handle: users.handle })
		.from(users)
		.where(eq(users.id, authorId))
		.limit(1);

	for (const recipientId of recipientIds) {
		// Upsert: if this exact (recipient, 'mention', author, lynt) tuple
		// already has a notification (e.g. the post was edited and still
		// mentions them, or they were @'d twice in the same text), bump
		// mention_count and refresh created_at/read instead of inserting
		// a duplicate row.
		await db
			.insert(notifications)
			.values({
				userId: recipientId,
				type: 'mention',
				sourceUserId: authorId,
				lyntId,
				mentionCount: 1
			})
			.onConflictDoUpdate({
				target: [notifications.userId, notifications.type, notifications.sourceUserId, notifications.lyntId],
				// Must mirror the partial index's WHERE clause exactly (migration
				// 0005: `WHERE type = 'mention'`) or Postgres won't match this
				// ON CONFLICT clause to that index.
				targetWhere: sql`${notifications.type} = 'mention'`,
				set: {
					mentionCount: sql`${notifications.mentionCount} + 1`,
					createdAt: new Date(),
					read: false
				}
			});

		sendToUser(recipientId, {
			type: 'notification',
			notificationType: 'mention',
			sourceUserId: authorId,
			lyntId
		});

		if (author) {
			sendNotificationEmail({
				recipientId,
				type: 'mention',
				actorUsername: author.username,
				actorHandle: author.handle,
				lyntContent: content,
				lyntId
			}).catch(() => {});

			sendPushNotification({
				recipientId,
				type: 'mention',
				actorUsername: author.username,
				lyntContent: content
			}).catch(() => {});
		}
	}
}
