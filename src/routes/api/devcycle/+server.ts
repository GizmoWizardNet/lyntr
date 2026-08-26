import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { devCycleEntries, devCycleItems, users } from '@/server/schema';
import { eq, desc, inArray } from 'drizzle-orm';

// Public /updates feed — published entries only, newest first. Grouped by
// entry with their bullet items attached, same shape catplay's "What's New"
// list renders (version tag + title + categorized bullets).
export const GET: RequestHandler = async () => {
	const entries = await db
		.select({
			id: devCycleEntries.id,
			version: devCycleEntries.version,
			title: devCycleEntries.title,
			body: devCycleEntries.body,
			publishedAt: devCycleEntries.published_at,
			authorHandle: users.handle,
			authorUsername: users.username
		})
		.from(devCycleEntries)
		.leftJoin(users, eq(devCycleEntries.author_id, users.id))
		.where(eq(devCycleEntries.published, true))
		.orderBy(desc(devCycleEntries.published_at));

	if (entries.length === 0) return json([]);

	const items = await db
		.select()
		.from(devCycleItems)
		.where(inArray(devCycleItems.entry_id, entries.map((e) => e.id)));

	const itemsByEntry = new Map<string, typeof items>();
	for (const item of items) {
		if (!itemsByEntry.has(item.entry_id)) itemsByEntry.set(item.entry_id, []);
		itemsByEntry.get(item.entry_id)!.push(item);
	}

	return json(
		entries.map((e) => ({
			...e,
			items: (itemsByEntry.get(e.id) ?? []).sort((a, b) => a.position - b.position)
		}))
	);
};
