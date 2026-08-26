import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { users, lynts, history } from '@/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { handleFeed } from './handle';
import { followingFeed } from './following';
import { newFeed } from './new';
import { mainFeed } from './main';
import { likedFeed } from './liked';
import { bookmarkedFeed } from './bookmarked';
import { hydratePolls } from '../util';

async function updateViewsAndHistory(userId: string, lyntIds: string[]) {
	if (lyntIds.length === 0) return;

	// Single bulk UPDATE instead of one transaction per lynt.
	// ANY($1::text[]) lets Postgres resolve all ids in one index scan.
	await db.execute(
		sql`UPDATE ${lynts} SET views = views + 1 WHERE id = ANY(${sql.raw(`ARRAY[${lyntIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')}]::text[]`)})`
	);

	// Single multi-row upsert instead of N individual inserts.
	await db
		.insert(history)
		.values(lyntIds.map((lyntId) => ({ user_id: userId, lynt_id: lyntId, createdAt: sql`now()` })))
		.onConflictDoUpdate({
			target: [history.user_id, history.lynt_id],
			set: { createdAt: sql`now()` }
		});
}

export const GET: RequestHandler = async ({ request, cookies, url }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	const handle = url.searchParams.get('handle');
	const type = url.searchParams.get('type') || 'For you';

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	// Added 'Bookmarked' to the valid tab list
	const tabs = ['For you', 'Following', 'Live', 'New', 'Liked', 'Bookmarked'];

	if (!tabs.includes(type)) {
		return json({ error: 'Invalid type property.' }, { status: 400 });
	}

	const excludePosts = url.searchParams.get('excludePosts')?.split(',') || [];
	const before = url.searchParams.get('before');
	const minIqParam = url.searchParams.get('minIq');
	const minIq = minIqParam ? parseInt(minIqParam, 10) : null;
	const validMinIq = Number.isFinite(minIq) ? minIq : null;

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		if (!jwtPayload.userId) {
			throw new Error('Invalid JWT token');
		}
		const userId = jwtPayload.userId;
		let result;

		if (handle) {
			const userResult = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.handle, handle))
				.limit(1);
			const user = userResult[0];
			if (!user) {
				return json({ error: 'User not found' }, { status: 404 });
			}
			if (type === 'Liked') {
				result = await likedFeed(user.id, before, validMinIq);
			} else {
				result = await handleFeed(user.id, userId, before, validMinIq);
			}
		} else if (type === 'Following') {
			result = await followingFeed(userId, before, validMinIq);
		} else if (type === 'New') {
			result = await newFeed(userId, before, validMinIq);
		} else if (type === 'Bookmarked') {
			// Bookmarks are always the current user's own — ignore handle param
			result = await bookmarkedFeed(userId, before, validMinIq);
		} else {
			result = await mainFeed(userId, 20, excludePosts, validMinIq);
		}

		// Update views and history in the background
		const lyntIds = result.map((lynt) => lynt.id);
		updateViewsAndHistory(userId, lyntIds).catch((error) => {
			console.error('Error updating views and history:', error);
		});

		return json({ lynts: hydratePolls(result) });
	} catch (error) {
		console.error('Authentication error:', error);
		return json({ error: 'Authentication failed' }, { status: 401 });
	}
};
