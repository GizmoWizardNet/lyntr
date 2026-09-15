import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import {
	users,
	lynts,
	likes,
	followers,
	bookmarks,
	notifications,
	history,
	userAchievements,
	forumThreads,
	forumPosts,
	forumPostVotes,
	lcTransactions,
	pollVotes,
	dmMessages,
	dmMembers,
	scrollables,
	scrollableLikes,
	scrollableBookmarks,
	scrollableComments,
	lyntReactions,
	userLyntskins,
	clanLynts,
	apiClients
} from '@/server/schema';
import { eq } from 'drizzle-orm';
import { sensitiveRatelimit } from '@/server/ratelimit';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const { success } = await sensitiveRatelimit.limit(
		request.headers.get('CF-Connecting-IP') ?? '127.0.0.1'
	);
	if (!success) {
		return json({ error: 'You are being ratelimited.' }, { status: 429 });
	}

	const authToken = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authToken) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let userId: string;
	try {
		const decoded = await verifyAuthJWT(authToken);
		userId = decoded.userId;
	} catch {
		return json({ error: 'Invalid token' }, { status: 401 });
	}

	const [profileRows, lyntRows, likeRows, followingRows, followerRows, bookmarkRows, notificationRows, historyRows, achievementRows, forumThreadRows, forumPostRows, forumVoteRows, lcTransactionRows, pollVoteRows, sentDmRows, dmMembershipRows, scrollableRows, scrollableLikeRows, scrollableBookmarkRows, scrollableCommentRows, reactionRows, lyntskinRows, clanLyntRows, apiClientRows] =
		await Promise.all([
			db.select().from(users).where(eq(users.id, userId)).limit(1),
			db.select().from(lynts).where(eq(lynts.user_id, userId)),
			db.select().from(likes).where(eq(likes.user_id, userId)),
			db.select().from(followers).where(eq(followers.follower_id, userId)),
			db.select().from(followers).where(eq(followers.user_id, userId)),
			db.select().from(bookmarks).where(eq(bookmarks.user_id, userId)),
			db.select().from(notifications).where(eq(notifications.userId, userId)),
			db.select().from(history).where(eq(history.user_id, userId)),
			db.select().from(userAchievements).where(eq(userAchievements.user_id, userId)),
			db.select().from(forumThreads).where(eq(forumThreads.user_id, userId)),
			db.select().from(forumPosts).where(eq(forumPosts.user_id, userId)),
			db.select().from(forumPostVotes).where(eq(forumPostVotes.user_id, userId)),
			db.select().from(lcTransactions).where(eq(lcTransactions.user_id, userId)),
			db.select().from(pollVotes).where(eq(pollVotes.user_id, userId)),
			db.select().from(dmMessages).where(eq(dmMessages.sender_id, userId)),
			db.select().from(dmMembers).where(eq(dmMembers.user_id, userId)),
			db.select().from(scrollables).where(eq(scrollables.user_id, userId)),
			db.select().from(scrollableLikes).where(eq(scrollableLikes.user_id, userId)),
			db.select().from(scrollableBookmarks).where(eq(scrollableBookmarks.user_id, userId)),
			db.select().from(scrollableComments).where(eq(scrollableComments.user_id, userId)),
			db.select().from(lyntReactions).where(eq(lyntReactions.user_id, userId)),
			db.select().from(userLyntskins).where(eq(userLyntskins.user_id, userId)),
			db.select().from(clanLynts).where(eq(clanLynts.author_id, userId)),
			db.select().from(apiClients).where(eq(apiClients.user_id, userId))
		]);

	if (profileRows.length === 0) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	const { token, rugplay_api_key_enc, ...profile } = profileRows[0];

	const sanitizedApiClients = apiClientRows.map(
		({ secret_hash, secret_salt, ...rest }) => rest
	);

	const exportPayload = {
		exported_at: new Date().toISOString(),
		account: profile,
		lynts: lyntRows,
		likes_given: likeRows,
		following: followingRows,
		followers: followerRows,
		bookmarks: bookmarkRows,
		notifications: notificationRows,
		view_history: historyRows,
		achievements: achievementRows,
		forum_threads: forumThreadRows,
		forum_posts: forumPostRows,
		forum_post_votes: forumVoteRows,
		lyntcoins_ledger: lcTransactionRows,
		poll_votes: pollVoteRows,
		direct_messages_sent: sentDmRows,
		direct_message_memberships: dmMembershipRows,
		scrollables: scrollableRows,
		scrollable_likes: scrollableLikeRows,
		scrollable_bookmarks: scrollableBookmarkRows,
		scrollable_comments: scrollableCommentRows,
		lynt_reactions: reactionRows,
		purchased_lyntskins: lyntskinRows,
		clan_lynts_authored: clanLyntRows,
		api_clients: sanitizedApiClients
	};

	const filename = `lyntr-data-export-${profile.handle}-${new Date().toISOString().slice(0, 10)}.json`;

	return new Response(JSON.stringify(exportPayload, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};