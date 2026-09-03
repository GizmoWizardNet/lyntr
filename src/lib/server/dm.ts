import { db } from '@/server/db';
import { dmConversations, dmMembers, users, userBlocks } from '@/server/schema';
import { and, eq, isNull } from 'drizzle-orm';

export interface DmMember {
	conversation_id: string;
	user_id: string;
	role: string;
	nickname: string | null;
	muted: boolean;
	pinned: boolean;
	last_read_message_id: string | null;
	last_read_at: Date | null;
}

// Active (not-left) membership row for a user in a conversation, or null.
export async function getMembership(conversationId: string, userId: string): Promise<DmMember | null> {
	const [row] = await db
		.select()
		.from(dmMembers)
		.where(and(
			eq(dmMembers.conversation_id, conversationId),
			eq(dmMembers.user_id, userId),
			isNull(dmMembers.left_at)
		))
		.limit(1);
	return row ?? null;
}

export async function getConversation(conversationId: string) {
	const [conv] = await db.select().from(dmConversations).where(eq(dmConversations.id, conversationId)).limit(1);
	return conv ?? null;
}

// All active members of a conversation, with user profile fields joined in.
export async function getActiveMembers(conversationId: string) {
	return db
		.select({
			user_id: dmMembers.user_id,
			role: dmMembers.role,
			nickname: dmMembers.nickname,
			joined_at: dmMembers.joined_at,
			username: users.username,
			handle: users.handle,
			name_color: users.name_color,
			verified: users.verified,
			last_read_message_id: dmMembers.last_read_message_id,
			last_read_at: dmMembers.last_read_at
		})
		.from(dmMembers)
		.innerJoin(users, eq(users.id, dmMembers.user_id))
		.where(and(eq(dmMembers.conversation_id, conversationId), isNull(dmMembers.left_at)));
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
	const [row] = await db
		.select({ blocker_id: userBlocks.blocker_id })
		.from(userBlocks)
		.where(and(eq(userBlocks.blocker_id, blockerId), eq(userBlocks.blocked_id, blockedId)))
		.limit(1);
	return !!row;
}

// True if either user has blocked the other — used to gate new 1:1 requests
// and message delivery.
export async function eitherBlocked(userA: string, userB: string): Promise<boolean> {
	return (await isBlocked(userA, userB)) || (await isBlocked(userB, userA));
}
