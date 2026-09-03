import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { devCycleEntries, devCycleItems, users } from '@/server/schema';
import { asc, desc, eq, inArray } from 'drizzle-orm';

// Public "what's new" feed for /updates. Read-only, published entries
// only, newest first, each with its New/Improved/Fixed/Removed bullet
// items attached. Write side (create/edit/publish/delete) lives at
// api/admin/devcycle/+server.ts, gated on is_admin.

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
		.select({
			id: devCycleItems.id,
			entryId: devCycleItems.entry_id,
			category: devCycleItems.category,
			content: devCycleItems.content,
			position: devCycleItems.position
		})
		.from(devCycleItems)
		.where(
			inArray(
				devCycleItems.entry_id,
				entries.map((e) => e.id)
			)
		)
		.orderBy(asc(devCycleItems.position));

	const itemsByEntry = new Map<string, typeof items>();
	for (const item of items) {
		if (!itemsByEntry.has(item.entryId)) itemsByEntry.set(item.entryId, []);
		itemsByEntry.get(item.entryId)!.push(item);
	}

	return json(
		entries.map((e) => ({
			...e,
			items: (itemsByEntry.get(e.id) ?? []).map(({ id, category, content, position }) => ({
				id,
				category,
				content,
				position
			}))
		}))
	);
};
