import { json } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { verifyAuthJWT } from './jwt';
import { db } from './db';
import { users, forumPosts, forumPostVotes } from './schema';
import { eq, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Auth helpers — mirrors the pattern used by /api/comment, /api/lynt, etc.
// ---------------------------------------------------------------------------

export type ForumAuthResult =
	| { ok: true; userId: string; isAdmin: boolean }
	| { ok: false; status: number; error: string };

export async function authenticate(cookies: Cookies): Promise<ForumAuthResult> {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return { ok: false, status: 401, error: 'Missing authentication' };

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		if (!jwtPayload.userId) throw new Error('Invalid JWT token');

		const [user] = await db
			.select({ id: users.id, is_admin: users.is_admin })
			.from(users)
			.where(eq(users.id, jwtPayload.userId))
			.limit(1);

		if (!user) return { ok: false, status: 401, error: 'Authentication failed' };

		return { ok: true, userId: user.id, isAdmin: !!user.is_admin };
	} catch {
		return { ok: false, status: 401, error: 'Authentication failed' };
	}
}

// Convenience wrapper for endpoints that just want a 401 JSON response
// the moment auth fails, without repeating the `if (!auth.ok)` dance.
export async function requireAuth(
	cookies: Cookies
): Promise<{ userId: string; isAdmin: boolean } | Response> {
	const auth = await authenticate(cookies);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	return { userId: auth.userId, isAdmin: auth.isAdmin };
}

// ---------------------------------------------------------------------------
// Vote score helpers — used by both the thread-detail and search endpoints
// so a post's score/up/down counts and the viewer's own vote stay consistent.
// ---------------------------------------------------------------------------

export const postScore = sql<number>`(
	select coalesce(sum(${forumPostVotes.value}), 0)
	from ${forumPostVotes}
	where ${forumPostVotes.post_id} = ${forumPosts.id}
)`.as('score');

export const postUpvotes = sql<number>`(
	select count(*) from ${forumPostVotes}
	where ${forumPostVotes.post_id} = ${forumPosts.id} and ${forumPostVotes.value} = 1
)`.as('upvotes');

export const postDownvotes = sql<number>`(
	select count(*) from ${forumPostVotes}
	where ${forumPostVotes.post_id} = ${forumPosts.id} and ${forumPostVotes.value} = -1
)`.as('downvotes');

export function postViewerVote(userId: string | null) {
	if (!userId) return sql<number>`0`.as('viewer_vote');
	return sql<number>`(
		select coalesce(${forumPostVotes.value}, 0)
		from ${forumPostVotes}
		where ${forumPostVotes.post_id} = ${forumPosts.id} and ${forumPostVotes.user_id} = ${userId}
	)`.as('viewer_vote');
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_POST_LENGTH = 5000;
