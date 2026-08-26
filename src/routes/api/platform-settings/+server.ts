import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

const VALID_DEFAULT_FEEDS = ['For you', 'New', 'Following', 'Bookmarked'];

export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const [row] = await db.select({ default_feed: users.default_feed }).from(users).where(eq(users.id, userId)).limit(1);
	return json({ default_feed: row?.default_feed ?? 'For you' });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const body = await request.json();
	const defaultFeed = String(body.default_feed ?? '');

	if (!VALID_DEFAULT_FEEDS.includes(defaultFeed)) {
		return json({ error: 'Invalid default feed' }, { status: 400 });
	}

	await db.update(users).set({ default_feed: defaultFeed }).where(eq(users.id, userId));
	return json({ default_feed: defaultFeed });
};
