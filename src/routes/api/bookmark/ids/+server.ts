import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { bookmarks } from '@/server/schema';
import { desc, eq } from 'drizzle-orm';

// GET /api/bookmark/ids — every lynt id the current user has bookmarked, in one query.
// Replaces one GET /api/bookmark?id=... request per rendered lynt.
export const GET: RequestHandler = async ({ cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return json({ ids: [] });

	let userId: string | undefined;
	try {
		userId = (await verifyAuthJWT(authCookie)).userId;
	} catch {
		return json({ ids: [] });
	}
	if (!userId) return json({ ids: [] });

	const rows = await db
		.select({ id: bookmarks.lynt_id })
		.from(bookmarks)
		.where(eq(bookmarks.user_id, userId))
		.orderBy(desc(bookmarks.saved_at))
		.limit(5000);

	return json(
		{ ids: rows.map((r) => String(r.id)) },
		{ headers: { 'Cache-Control': 'private, no-store' } }
	);
};
