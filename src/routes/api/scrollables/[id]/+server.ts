import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { scrollables } from '@/server/schema';
import { scrollablesMinioClient, SCROLLABLES_BUCKET } from '@/server/scrollablesMinio';
import { and, eq, sql } from 'drizzle-orm';
import { getScrollable } from '@/server/scrollables';
import { broadcastScrollableDeleted } from '$lib/ws';

// GET /api/scrollables/[id] — used for direct share links (/scrollables/[id])
// and by the SSR og:meta lookup, same role as getLynt() for lynts.
export const GET: RequestHandler = async ({ params, cookies }) => {
	const userId = await requireUser(cookies);
	const row = await getScrollable(params.id!, userId);
	if (!row) return json({ error: 'Not found' }, { status: 404 });

	// Fire-and-forget view increment — not awaited, a lost view on a race
	// isn't worth blocking the response for.
	db.update(scrollables).set({ views: sql`${scrollables.views} + 1` }).where(eq(scrollables.id, params.id!)).catch(() => {});

	return json({ scrollable: row });
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const [row] = await db.select({ userId: scrollables.user_id, videoKey: scrollables.video_key, thumbnailKey: scrollables.thumbnail_key })
		.from(scrollables).where(eq(scrollables.id, params.id!)).limit(1);

	if (!row) return json({ error: 'Not found' }, { status: 404 });
	if (row.userId !== userId) return json({ error: 'Forbidden' }, { status: 403 });

	await db.delete(scrollables).where(eq(scrollables.id, params.id!));

	await scrollablesMinioClient.removeObject(SCROLLABLES_BUCKET, `${row.videoKey}.mp4`).catch(() => {});
	if (row.thumbnailKey) {
		await scrollablesMinioClient.removeObject(SCROLLABLES_BUCKET, `${row.thumbnailKey}.webp`).catch(() => {});
	}

	// Live for everyone, same reasoning as broadcastLyntDeleted — before this,
	// a deleted scrollable stayed in every other open feed's scroll stack
	// until a manual reload.
	broadcastScrollableDeleted(params.id!);

	return json({ success: true });
};
