import { PUBLIC_CDN_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { dmMessages, dmConversations, dmReactions, users } from '@/server/schema';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import { minioClient } from '@/server/minio';
import { sendDmMessage, broadcastDmToMembers } from '$lib/ws';
import { getMembership, getConversation, getActiveMembers } from '@/server/dm';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

// ── GET /api/dm/messages?conversation_id=&before= ────────────────────────
// Returns up to 50 messages, newest last, with optional cursor for pagination,
// each message's reactions grouped by emoji, and its reply preview if any.
export const GET: RequestHandler = async ({ url, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const conversationId = url.searchParams.get('conversation_id');
	const before = url.searchParams.get('before'); // ISO timestamp cursor
	if (!conversationId) return json({ error: 'Missing conversation_id' }, { status: 400 });

	const membership = await getMembership(conversationId, userId);
	if (!membership) return json({ error: 'Not found' }, { status: 404 });
	const conv = await getConversation(conversationId);
	if (!conv) return json({ error: 'Not found' }, { status: 404 });

	const members = await getActiveMembers(conversationId);
	const otherUser = !conv.is_group ? members.find(m => m.user_id !== userId) ?? null : null;

	const whereClause = before
		? and(eq(dmMessages.conversation_id, conversationId), lt(dmMessages.created_at, new Date(before)))
		: eq(dmMessages.conversation_id, conversationId);

	const messages = await db
		.select()
		.from(dmMessages)
		.where(whereClause)
		.orderBy(asc(dmMessages.created_at))
		.limit(50);

	// Reactions for this page of messages, grouped by message + emoji.
	let reactionsByMessage: Record<string, { emoji: string; count: number; me: boolean }[]> = {};
	if (messages.length > 0) {
		const msgIds = messages.map(m => m.id);
		const rows = await db.select().from(dmReactions).where(inArray(dmReactions.message_id, msgIds));
		const grouped = new Map<string, Map<string, { count: number; me: boolean }>>();
		for (const r of rows) {
			if (!grouped.has(r.message_id)) grouped.set(r.message_id, new Map());
			const g = grouped.get(r.message_id)!;
			const existing = g.get(r.emoji) ?? { count: 0, me: false };
			existing.count += 1;
			if (r.user_id === userId) existing.me = true;
			g.set(r.emoji, existing);
		}
		for (const [msgId, emojis] of grouped) {
			reactionsByMessage[msgId] = Array.from(emojis.entries()).map(([emoji, v]) => ({ emoji, ...v }));
		}
	}

	// Reply previews — fetch the referenced messages in one batch.
	const replyIds = [...new Set(messages.filter(m => m.reply_to_id).map(m => m.reply_to_id as string))];
	let repliesById: Record<string, { id: string; content: string | null; sender_id: string }> = {};
	if (replyIds.length > 0) {
		const replied = await db.select({ id: dmMessages.id, content: dmMessages.content, sender_id: dmMessages.sender_id })
			.from(dmMessages).where(inArray(dmMessages.id, replyIds));
		for (const r of replied) repliesById[r.id] = r;
	}

	return json({
		conversation: { ...conv, other_user: otherUser, members },
		messages: messages.map(m => ({
			...m,
			reactions: reactionsByMessage[m.id] ?? [],
			reply_to: m.reply_to_id ? repliesById[m.reply_to_id] ?? null : null
		}))
	});
};

// ── POST /api/dm/messages ─────────────────────────────────────────────────
// Sends a message. Accepts multipart/form-data for attachments.
// Optional field `reply_to_id` to reply to an earlier message.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const formData = await request.formData();
	const conversationId = formData.get('conversation_id') as string;
	const content = (formData.get('content') as string | null) || null;
	const gifUrl = (formData.get('gif_url') as string | null) || null;
	const gifPreviewUrl = (formData.get('gif_preview_url') as string | null) || null;
	const replyToId = (formData.get('reply_to_id') as string | null) || null;
	const attachmentFile = formData.get('attachment') as File | null;

	if (!conversationId) return json({ error: 'Missing conversation_id' }, { status: 400 });
	if (!content && !gifUrl && !attachmentFile) return json({ error: 'Message is empty' }, { status: 400 });

	const membership = await getMembership(conversationId, userId);
	if (!membership) return json({ error: 'Not found' }, { status: 404 });
	const conv = await getConversation(conversationId);
	if (!conv) return json({ error: 'Not found' }, { status: 404 });
	if (conv.status !== 'active') return json({ error: 'Conversation is not active' }, { status: 403 });

	let attachmentUrl: string | null = null;
	let attachmentName: string | null = null;
	let attachmentSize: number | null = null;
	let attachmentType: string | null = null;

	if (attachmentFile) {
		if (attachmentFile.size > MAX_ATTACHMENT_BYTES) {
			return json({ error: 'Attachment too large (max 25 MB)' }, { status: 413 });
		}
		const buffer = Buffer.from(await attachmentFile.arrayBuffer());
		const ext = attachmentFile.name.split('.').pop() ?? 'bin';
		const key = `dm/${conversationId}/${crypto.randomUUID()}.${ext}`;
		await minioClient.putObject('lyntr', key, buffer, buffer.length, { 'Content-Type': attachmentFile.type });
		attachmentUrl = `${PUBLIC_CDN_URL}/lyntr/${key}`;
		attachmentName = attachmentFile.name;
		attachmentSize = attachmentFile.size;
		attachmentType = attachmentFile.type;
	}

	// Preview for conversation list (strip markdown/GIF refs)
	const previewText = content
		? content.replace(/\*+|_+|~~|`/g, '').slice(0, 80)
		: gifUrl ? '🎞 GIF'
		: attachmentName ? `📎 ${attachmentName}`
		: '';

	const [msg] = await db.insert(dmMessages).values({
		conversation_id: conversationId,
		sender_id: userId,
		content,
		gif_url: gifUrl,
		gif_preview_url: gifPreviewUrl,
		attachment_url: attachmentUrl,
		attachment_name: attachmentName,
		attachment_size: attachmentSize,
		attachment_type: attachmentType,
		reply_to_id: replyToId
	}).returning();

	await db.update(dmConversations).set({
		last_message_at: msg.created_at,
		last_message_preview: conv.is_group ? previewText : previewText // (group prefixing with sender name is done client-side using sender_id)
	}).where(eq(dmConversations.id, conversationId));

	// Push to every other active member — works for both 1:1 and group DMs.
	const members = await getActiveMembers(conversationId);
	const otherMemberIds = members.map(m => m.user_id).filter(id => id !== userId);
	for (const uid of otherMemberIds) {
		sendDmMessage(uid, { conversation_id: conversationId, message: { ...msg, reactions: [], reply_to: null } });
	}

	return json({ ...msg, reactions: [], reply_to: null }, { status: 201 });
};

// ── PATCH /api/dm/messages ────────────────────────────────────────────────
// Edits the content of one of your own messages. Attachments/GIFs are not
// editable — only the text body.
export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { message_id, content } = await request.json() as { message_id: string; content: string };
	if (!message_id || !content?.trim()) return json({ error: 'Invalid request' }, { status: 400 });

	const [msg] = await db.select().from(dmMessages).where(eq(dmMessages.id, message_id)).limit(1);
	if (!msg || msg.sender_id !== userId || msg.deleted_at) return json({ error: 'Not found' }, { status: 404 });

	const [updated] = await db.update(dmMessages)
		.set({ content: content.slice(0, 4000), edited_at: new Date() })
		.where(eq(dmMessages.id, message_id))
		.returning();

	const members = await getActiveMembers(msg.conversation_id);
	broadcastDmToMembers(
		members.map(m => m.user_id),
		{ type: 'dm_message_edited', conversation_id: msg.conversation_id, message_id, content: updated.content, edited_at: updated.edited_at },
		userId
	);

	return json(updated);
};

// ── DELETE /api/dm/messages ───────────────────────────────────────────────
// Soft-deletes a message (own messages only).
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { message_id } = await request.json() as { message_id: string };

	const [msg] = await db.select({ id: dmMessages.id, sender_id: dmMessages.sender_id, conversation_id: dmMessages.conversation_id })
		.from(dmMessages).where(eq(dmMessages.id, message_id)).limit(1);

	if (!msg || msg.sender_id !== userId) return json({ error: 'Not found' }, { status: 404 });

	await db.update(dmMessages).set({ deleted_at: new Date() }).where(eq(dmMessages.id, message_id));

	const members = await getActiveMembers(msg.conversation_id);
	broadcastDmToMembers(
		members.map(m => m.user_id),
		{ type: 'dm_message_deleted', message_id, conversation_id: msg.conversation_id },
		userId
	);

	return json({ deleted: true });
};
