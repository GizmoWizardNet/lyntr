import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { or, ilike, ne, and, sql } from 'drizzle-orm';

/**
 * GET /api/mentions/search?q=<prefix>
 *
 * Lightweight user lookup for the @mention autocomplete dropdown. Distinct
 * from /api/followsearch (which is follower/following-scoped and substring
 * matches) — this is a plain handle/username prefix search across all
 * users, capped small since it's rendered as a live-typing dropdown.
 *
 * The current user is excluded from results — you can't mention yourself,
 * so there's no reason to suggest yourself.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return json({ error: 'Missing authentication' }, { status: 401 });

	let userId: string;
	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		userId = jwtPayload.userId;
		if (!userId) throw new Error('Invalid JWT token');
	} catch {
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return json([]);
	if (q.length > 32) return json([]); // handles can't be longer than this anyway

	try {
		const results = await db
			.select({
				id: users.id,
				handle: users.handle,
				username: users.username,
				verified: users.verified,
				nameColor: users.name_color
			})
			.from(users)
			.where(
				and(
					ne(users.id, userId), // exclude self — can't mention yourself
					or(ilike(users.handle, `${q}%`), ilike(users.username, `${q}%`))
				)
			)
			// Prefer handle-prefix matches over username-prefix matches when both
			// could apply, then shorter handles (closer matches) first.
			.orderBy(
				sql`(case when ${users.handle} ilike ${q + '%'} then 0 else 1 end)`,
				sql`length(${users.handle})`
			)
			.limit(6);

		return json(results);
	} catch (error) {
		console.error('Error searching mentions:', error);
		return json({ error: 'Failed to search users' }, { status: 500 });
	}
};
