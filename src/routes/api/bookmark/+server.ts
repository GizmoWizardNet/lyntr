import { json } from '@sveltejs/kit';
import type { Cookies, RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { bookmarks, lynts } from '@/server/schema';
import { and, eq } from 'drizzle-orm';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { awardBookmarkReceived } from '@/server/lyntcoins';

async function resolveUser(cookies: Cookies): Promise<string | null> {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return null;
	try {
		const payload = await verifyAuthJWT(authCookie);
		return payload.userId ?? null;
	} catch {
		return null;
	}
}

// POST /api/bookmark — save a lynt
// Body: { lyntId: string }
export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await resolveUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	let body: { lyntId: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { lyntId } = body;
	if (!lyntId) return json({ error: 'Missing lyntId' }, { status: 400 });

	// Verify the lynt actually exists
	const [lynt] = await db.select({ id: lynts.id, user_id: lynts.user_id }).from(lynts).where(eq(lynts.id, lyntId)).limit(1);
	if (!lynt) return json({ error: 'Lynt not found' }, { status: 404 });

	try {
		const inserted = await db
			.insert(bookmarks)
			.values({ user_id: userId, lynt_id: lyntId })
			.onConflictDoNothing() // idempotent — saving twice is fine
			.returning({ lynt_id: bookmarks.lynt_id });

		if (inserted.length > 0 && lynt.user_id && lynt.user_id !== userId) {
			try {
				await awardBookmarkReceived(lynt.user_id, userId, lyntId);
			} catch (lcError) {
				console.error('LyntCoins award error (bookmark):', lcError);
			}
		}

		return json({ message: 'Bookmarked' }, { status: 201 });
	} catch (error) {
		console.error('Error bookmarking lynt:', error);
		return json({ error: 'Failed to bookmark' }, { status: 500 });
	}
};

// DELETE /api/bookmark?id=<lyntId> — remove a bookmark
export const DELETE: RequestHandler = async ({ url, cookies }) => {
	const userId = await resolveUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const lyntId = url.searchParams.get('id');
	if (!lyntId) return json({ error: 'Missing lynt ID' }, { status: 400 });

	try {
		await db
			.delete(bookmarks)
			.where(and(eq(bookmarks.user_id, userId), eq(bookmarks.lynt_id, lyntId)));

		return json({ message: 'Bookmark removed' }, { status: 200 });
	} catch (error) {
		console.error('Error removing bookmark:', error);
		return json({ error: 'Failed to remove bookmark' }, { status: 500 });
	}
};

// GET /api/bookmark?id=<lyntId> — check if the current user has bookmarked a lynt
export const GET: RequestHandler = async ({ url, cookies }) => {
	const userId = await resolveUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const lyntId = url.searchParams.get('id');
	if (!lyntId) return json({ error: 'Missing lynt ID' }, { status: 400 });

	const [row] = await db
		.select({ lynt_id: bookmarks.lynt_id })
		.from(bookmarks)
		.where(and(eq(bookmarks.user_id, userId), eq(bookmarks.lynt_id, lyntId)))
		.limit(1);

	return json({ bookmarked: !!row });
};
