import { db } from '@/server/db';
import {
	clanLynts,
	clanLyntMembers,
	lyntContributors,
	lynts,
	users,
	followers
} from '@/server/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { createNotification } from '@/server/notifications';
import { sendToUser } from '$lib/ws';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { awardPostCreated } from '@/server/lyntcoins';

const CLAN_EPOCH = new Date('2024-07-13T11:29:44.526Z').getTime();
function newLyntId(): string {
	return String(new Snowflake({ custom_epoch: CLAN_EPOCH }).getUniqueID());
}

/** "Friends" = mutual follow — both rows exist in `followers`. */
export async function getFriendIds(userId: string): Promise<Set<string>> {
	// People userId follows, and people who follow userId back — the
	// intersection is "friends". Two simple indexed lookups instead of a
	// subquery, since both sides of `followers` are already indexed.
	const [iFollow, followMe] = await Promise.all([
		db.select({ id: followers.user_id }).from(followers).where(eq(followers.follower_id, userId)),
		db.select({ id: followers.follower_id }).from(followers).where(eq(followers.user_id, userId))
	]);
	const followMeSet = new Set(followMe.map((r) => r.id));
	return new Set(iFollow.map((r) => r.id).filter((id) => followMeSet.has(id)));
}

export async function areFriends(a: string, b: string): Promise<boolean> {
	const [row] = await db
		.select({ x: sql<number>`1` })
		.from(followers)
		.where(and(eq(followers.follower_id, a), eq(followers.user_id, b)))
		.limit(1);
	const [back] = await db
		.select({ x: sql<number>`1` })
		.from(followers)
		.where(and(eq(followers.follower_id, b), eq(followers.user_id, a)))
		.limit(1);
	return !!row && !!back;
}

export class ClanLyntError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

/**
 * Starts a relay. `memberIds` is the ordered chain after the author —
 * position 0 is always the author (auto-accepted, they wrote the draft),
 * position 1 is memberIds[0], and so on. Every member must be a mutual
 * follow of the author (not of each other — only the author's friend list
 * gates who can be invited into their own clan lynt).
 */
export async function createClanDraft(
	authorId: string,
	content: string,
	memberIds: string[],
	gifUrl?: string | null,
	gifPreviewUrl?: string | null
) {
	const uniqueMembers = [...new Set(memberIds)].filter((id) => id !== authorId);
	if (uniqueMembers.length === 0) {
		throw new ClanLyntError('Pick at least one friend to include.');
	}
	if (uniqueMembers.length > 9) {
		throw new ClanLyntError('Clan lynts are capped at 10 contributors (including you).');
	}

	const friendIds = await getFriendIds(authorId);
	const nonFriends = uniqueMembers.filter((id) => !friendIds.has(id));
	if (nonFriends.length > 0) {
		throw new ClanLyntError('You can only add mutual friends to a clan lynt.');
	}

	const [clan] = await db
		.insert(clanLynts)
		.values({
			author_id: authorId,
			content,
			gif_url: gifUrl ?? null,
			gif_preview_url: gifPreviewUrl ?? null,
			current_step: 1
		})
		.returning();

	await db.insert(clanLyntMembers).values([
		{ clan_id: clan.id, user_id: authorId, position: 0, status: 'accepted', responded_at: new Date() },
		...uniqueMembers.map((id, i) => ({ clan_id: clan.id, user_id: id, position: i + 1, status: 'pending' as const }))
	]);

	await notifyCurrentStep(clan.id);
	return clan;
}

async function getClanWithMembers(clanId: string) {
	const [clan] = await db.select().from(clanLynts).where(eq(clanLynts.id, clanId)).limit(1);
	if (!clan) return null;
	const members = await db
		.select()
		.from(clanLyntMembers)
		.where(eq(clanLyntMembers.clan_id, clanId))
		.orderBy(clanLyntMembers.position);
	return { clan, members };
}

async function notifyCurrentStep(clanId: string) {
	const data = await getClanWithMembers(clanId);
	if (!data) return;
	const { clan, members } = data;
	const current = members.find((m) => m.position === clan.current_step);
	if (!current) return;
	const [author] = await db.select({ username: users.username }).from(users).where(eq(users.id, clan.author_id)).limit(1);
	await createNotification(current.user_id, 'clan_invite', clan.author_id, undefined, undefined, undefined, {
		lyntContent: clan.content
	}, clan.id);
	sendToUser(current.user_id, { type: 'clan_invite', clanId: clan.id, fromUsername: author?.username });
}

/**
 * One step of the relay. `action: 'decline'` kills the whole draft — per
 * spec, a single decline deletes the lynt entirely, nobody else's accept
 * survives it. `action: 'accept'` optionally edits the text, then either
 * hands off to the next person or — if this was the last member — publishes.
 */
export async function respondToClanStep(
	clanId: string,
	userId: string,
	action: 'accept' | 'decline',
	editedContent?: string
) {
	const data = await getClanWithMembers(clanId);
	if (!data) throw new ClanLyntError('Clan lynt not found.', 404);
	const { clan, members } = data;

	if (clan.status !== 'pending') {
		throw new ClanLyntError('This clan lynt is no longer pending.', 409);
	}

	const me = members.find((m) => m.user_id === userId);
	if (!me) throw new ClanLyntError('You are not part of this clan lynt.', 403);
	if (me.position !== clan.current_step) {
		throw new ClanLyntError("It's not your turn yet.", 409);
	}
	if (me.status !== 'pending') {
		throw new ClanLyntError('You already responded to this clan lynt.', 409);
	}

	if (action === 'decline') {
		await db
			.update(clanLyntMembers)
			.set({ status: 'declined', responded_at: new Date() })
			.where(and(eq(clanLyntMembers.clan_id, clanId), eq(clanLyntMembers.user_id, userId)));
		await db.update(clanLynts).set({ status: 'declined', updated_at: new Date() }).where(eq(clanLynts.id, clanId));

		const [decliner] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
		// Everyone who'd already accepted (including the author) gets told
		// it's dead — there's no lynt to go look at, so no lyntId here.
		for (const m of members) {
			if (m.user_id === userId) continue;
			if (m.status === 'accepted') {
				await createNotification(m.user_id, 'clan_declined', userId, undefined, undefined, undefined, {
					lyntContent: clan.content
				}, clanId);
				sendToUser(m.user_id, { type: 'clan_declined', clanId, byUsername: decliner?.username });
			}
		}
		return { status: 'declined' as const };
	}

	// accept
	const nextContent = editedContent?.trim() ? editedContent.trim() : clan.content;
	await db
		.update(clanLyntMembers)
		.set({ status: 'accepted', responded_at: new Date() })
		.where(and(eq(clanLyntMembers.clan_id, clanId), eq(clanLyntMembers.user_id, userId)));

	const isLast = clan.current_step === members[members.length - 1].position;

	if (isLast) {
		await db
			.update(clanLynts)
			.set({ content: nextContent, updated_at: new Date() })
			.where(eq(clanLynts.id, clanId));
		const lynt = await publishClanLynt(clanId);
		return { status: 'published' as const, lynt };
	}

	await db
		.update(clanLynts)
		.set({ content: nextContent, current_step: clan.current_step + 1, updated_at: new Date() })
		.where(eq(clanLynts.id, clanId));
	await notifyCurrentStep(clanId);
	return { status: 'passed' as const };
}

async function publishClanLynt(clanId: string) {
	const data = await getClanWithMembers(clanId);
	if (!data) throw new ClanLyntError('Clan lynt not found.', 404);
	const { clan, members } = data;

	const contributorIds = members.filter((m) => m.status === 'accepted').map((m) => m.user_id);
	const contributorUsers = await db
		.select({ id: users.id, iq: users.iq, username: users.username })
		.from(users)
		.where(inArray(users.id, contributorIds));

	const avgIq = Math.round(
		contributorUsers.reduce((sum, u) => sum + (u.iq ?? 0), 0) / Math.max(contributorUsers.length, 1)
	);

	const lyntId = newLyntId();
	await db.insert(lynts).values({
		id: lyntId,
		user_id: clan.author_id,
		content: clan.content,
		gif_url: clan.gif_url,
		gif_preview_url: clan.gif_preview_url,
		has_link: /https?:\/\//.test(clan.content),
		is_clan: true,
		clan_avg_iq: avgIq
	});

	await db.insert(lyntContributors).values(
		members
			.filter((m) => m.status === 'accepted')
			.map((m) => ({ lynt_id: lyntId, user_id: m.user_id, position: m.position }))
	);

	await db
		.update(clanLynts)
		.set({ status: 'completed', resulting_lynt_id: lyntId, updated_at: new Date() })
		.where(eq(clanLynts.id, clanId));

	// Same post-processing a solo lynt gets — mentions, hashtags, LC award
	// for the author who kicked it off.
	await processMentions(clan.content, clan.author_id, lyntId).catch(() => {});
	await processHashtags(clan.content, lyntId).catch(() => {});
	await awardPostCreated(clan.author_id, lyntId).catch(() => {});

	for (const u of contributorUsers) {
		await createNotification(u.id, 'clan_live', clan.author_id, lyntId, undefined, undefined, {
			lyntContent: clan.content
		});
		sendToUser(u.id, { type: 'clan_live', lyntId });
	}

	return { id: lyntId, contributorIds: contributorUsers.map((u) => u.id), avgIq };
}

/** Contributors of an already-published clan lynt, in relay order. */
export async function getContributors(lyntId: string) {
	return db
		.select({ id: lyntContributors.user_id, position: lyntContributors.position })
		.from(lyntContributors)
		.where(eq(lyntContributors.lynt_id, lyntId))
		.orderBy(lyntContributors.position);
}

/**
 * Like/comment/repost notification fan-out. For a clan lynt this notifies
 * every accepted contributor instead of just `lynts.user_id`; for a normal
 * lynt it's a single-element loop, so callers can use this unconditionally.
 *
 * `contributorLookupId` and `notifLyntId` are deliberately separate: for a
 * like/repost they're the same lynt, but for a comment the contributors to
 * fan out to belong to the *parent* (the clan lynt being replied to), while
 * the notification itself should link to the new reply — matching this
 * repo's existing convention of storing the comment's own id so the
 * notification click-through lands on the specific reply, not the parent.
 */
export async function notifyLyntEngagement(
	contributorLookupId: string,
	lyntUserId: string,
	isClan: boolean,
	type: 'like' | 'comment' | 'repost',
	actorId: string,
	notifLyntId: string,
	extras?: { lyntContent?: string | null }
) {
	const recipients = isClan ? (await getContributors(contributorLookupId)).map((c) => c.id) : [lyntUserId];
	for (const recipientId of recipients) {
		if (recipientId === actorId) continue;
		await createNotification(recipientId, type, actorId, notifLyntId, undefined, undefined, extras);
	}
}
