import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

const VALID_DEFAULT_FEEDS = ['For you', 'New', 'Following', 'Bookmarked'];

// Font names only ever get used as a CSS custom-property value and (for
// the Google Fonts lookup) a URL query param — neither position can
// execute script, but this still caps length and restricts to characters
// that legitimate font names actually use, so a garbage/huge value can't
// get stuck in the DB and rendered back to every page load for that user.
const FONT_NAME_PATTERN = /^[a-zA-Z0-9 '\-]{1,60}$/;

export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const [row] = await db
		.select({ default_feed: users.default_feed, custom_font: users.custom_font })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return json({ default_feed: row?.default_feed ?? 'For you', custom_font: row?.custom_font ?? null });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const body = await request.json();
	const updateData: Partial<typeof users.$inferInsert> = {};

	if (body.default_feed !== undefined) {
		const defaultFeed = String(body.default_feed ?? '');
		if (!VALID_DEFAULT_FEEDS.includes(defaultFeed)) {
			return json({ error: 'Invalid default feed' }, { status: 400 });
		}
		updateData.default_feed = defaultFeed;
	}

	if (body.custom_font !== undefined) {
		const raw = body.custom_font;
		if (raw === null || raw === '') {
			updateData.custom_font = null;
		} else {
			const fontName = String(raw).trim();
			if (!FONT_NAME_PATTERN.test(fontName)) {
				return json({ error: 'Invalid font name' }, { status: 400 });
			}
			updateData.custom_font = fontName;
		}
	}

	if (Object.keys(updateData).length === 0) {
		return json({ error: 'Nothing to update' }, { status: 400 });
	}

	await db.update(users).set(updateData).where(eq(users.id, userId));
	return json(updateData);
};