import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { devCycleEntries, devCycleItems } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '@/server/forum';

// Dev Cycle admin API — create/update changelog entries. Reuses the same
// cookie + `users.is_admin` auth pattern as the forum's admin actions
// (requireAuth from lib/server/forum.ts) rather than the ADMIN_KEY header
// scheme some ops-style endpoints (routes/api/admin/featured, etc.) use —
// this is authored by real admin accounts through a normal UI session, not
// hit by a script/cron, so cookie auth is the right fit here.

type ItemInput = { category: 'new' | 'improved' | 'fixed' | 'removed'; content: string };

export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	const entries = await db.select().from(devCycleEntries).orderBy(desc(devCycleEntries.created_at));
	const items = await db.select().from(devCycleItems);
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

export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	let body: {
		version?: string | null;
		title: string;
		body: string;
		published?: boolean;
		items?: ItemInput[];
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.title?.trim()) return json({ error: 'Missing title' }, { status: 400 });
	if (!body.body?.trim()) return json({ error: 'Missing body' }, { status: 400 });

	const [entry] = await db
		.insert(devCycleEntries)
		.values({
			version: body.version?.trim() || null,
			title: body.title.trim(),
			body: body.body,
			author_id: auth.userId,
			published: !!body.published,
			published_at: body.published ? new Date() : null
		})
		.returning();

	if (body.items?.length) {
		await db.insert(devCycleItems).values(
			body.items.map((it, i) => ({
				entry_id: entry.id,
				category: it.category,
				content: it.content,
				position: i
			}))
		);
	}

	return json({ entry }, { status: 201 });
};

// PATCH toggles publish state or edits an existing entry — kept in the same
// file since it's the same small admin surface, not a separate resource.
export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	let body: {
		id: string;
		version?: string | null;
		title?: string;
		body?: string;
		published?: boolean;
		items?: ItemInput[];
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!body.id) return json({ error: 'Missing id' }, { status: 400 });

	const [existing] = await db.select().from(devCycleEntries).where(eq(devCycleEntries.id, body.id)).limit(1);
	if (!existing) return json({ error: 'Not found' }, { status: 404 });

	const wasPublished = existing.published;
	const willPublish = body.published ?? existing.published;

	const [updated] = await db
		.update(devCycleEntries)
		.set({
			version: body.version !== undefined ? body.version?.trim() || null : existing.version,
			title: body.title?.trim() || existing.title,
			body: body.body ?? existing.body,
			published: willPublish,
			// Only stamp published_at the first time an entry goes live, so
			// re-editing a published entry doesn't bump it back to the top
			// of a "recently published" sort.
			published_at: !wasPublished && willPublish ? new Date() : existing.published_at,
			updated_at: new Date()
		})
		.where(eq(devCycleEntries.id, body.id))
		.returning();

	if (body.items) {
		await db.delete(devCycleItems).where(eq(devCycleItems.entry_id, body.id));
		if (body.items.length) {
			await db.insert(devCycleItems).values(
				body.items.map((it, i) => ({
					entry_id: body.id,
					category: it.category,
					content: it.content,
					position: i
				}))
			);
		}
	}

	return json({ entry: updated });
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	const { id } = await request.json();
	if (!id) return json({ error: 'Missing id' }, { status: 400 });

	await db.delete(devCycleEntries).where(eq(devCycleEntries.id, id));
	return json({ ok: true });
};
