import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { devCycleEntries, devCycleItems } from '@/server/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAuth } from '@/server/forum';

// Admin CRUD backing the /admin/devcycle composer — create, edit,
// publish/unpublish, and delete changelog entries along with their
// New/Improved/Fixed/Removed bullet items. Same cookie + is_admin auth
// pattern as api/admin/devcycle/notes/+server.ts. Public read side lives
// at api/devcycle/+server.ts, scoped to published rows only.

const CATEGORIES = new Set(['new', 'improved', 'fixed', 'removed']);

function sanitizeItems(raw: unknown): { category: string; content: string; position: number }[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((i: { category?: string; content?: string }, idx: number) => ({
			category: CATEGORIES.has(i?.category as string) ? (i!.category as string) : 'improved',
			content: (i?.content ?? '').toString().trim(),
			position: idx
		}))
		.filter((i) => i.content.length > 0);
}

export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	const entries = await db.select().from(devCycleEntries).orderBy(desc(devCycleEntries.created_at));
	if (entries.length === 0) return json([]);

	const items = await db
		.select()
		.from(devCycleItems)
		.where(
			inArray(
				devCycleItems.entry_id,
				entries.map((e) => e.id)
			)
		)
		.orderBy(devCycleItems.position);

	const itemsByEntry = new Map<string, typeof items>();
	for (const item of items) {
		if (!itemsByEntry.has(item.entry_id)) itemsByEntry.set(item.entry_id, []);
		itemsByEntry.get(item.entry_id)!.push(item);
	}

	return json(
		entries.map((e) => ({
			id: e.id,
			version: e.version,
			title: e.title,
			body: e.body,
			published: e.published,
			items: (itemsByEntry.get(e.id) ?? []).map((i) => ({
				category: i.category,
				content: i.content
			}))
		}))
	);
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	let body: { title?: string; body?: string; version?: string | null; published?: boolean; items?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const title = (body.title ?? '').toString().trim();
	const entryBody = (body.body ?? '').toString();
	if (!title) return json({ error: 'Missing title' }, { status: 400 });
	if (!entryBody.trim()) return json({ error: 'Missing body' }, { status: 400 });

	const version = body.version ? String(body.version).trim().slice(0, 32) || null : null;
	const published = Boolean(body.published);
	const items = sanitizeItems(body.items);

	const created = await db.transaction(async (trx) => {
		const [entry] = await trx
			.insert(devCycleEntries)
			.values({
				version,
				title,
				body: entryBody,
				author_id: auth.userId,
				published,
				published_at: published ? sql`now()` : null
			})
			.returning();

		if (items.length > 0) {
			await trx.insert(devCycleItems).values(items.map((i) => ({ ...i, entry_id: entry.id })));
		}

		return entry;
	});

	return json({ entry: created }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	let body: {
		id?: string;
		title?: string;
		body?: string;
		version?: string | null;
		published?: boolean;
		items?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const id = body.id;
	if (!id) return json({ error: 'Missing id' }, { status: 400 });

	const [existing] = await db.select().from(devCycleEntries).where(eq(devCycleEntries.id, id)).limit(1);
	if (!existing) return json({ error: 'Not found' }, { status: 404 });

	const updates: Record<string, unknown> = { updated_at: sql`now()` };

	if (body.title !== undefined) {
		const title = String(body.title).trim();
		if (!title) return json({ error: 'Title cannot be empty' }, { status: 400 });
		updates.title = title;
	}
	if (body.body !== undefined) {
		const entryBody = String(body.body);
		if (!entryBody.trim()) return json({ error: 'Body cannot be empty' }, { status: 400 });
		updates.body = entryBody;
	}
	if (body.version !== undefined) {
		updates.version = body.version ? String(body.version).trim().slice(0, 32) || null : null;
	}
	if (body.published !== undefined) {
		const published = Boolean(body.published);
		updates.published = published;
		// Only stamp published_at the first time an entry goes live —
		// flipping it back to draft and republishing later shouldn't bump
		// its date back to the top of the feed.
		if (published && !existing.published) updates.published_at = sql`now()`;
		if (!published) updates.published_at = null;
	}

	const [updated] = await db
		.update(devCycleEntries)
		.set(updates)
		.where(eq(devCycleEntries.id, id))
		.returning();

	if (body.items !== undefined) {
		const items = sanitizeItems(body.items);
		await db.transaction(async (trx) => {
			await trx.delete(devCycleItems).where(eq(devCycleItems.entry_id, id));
			if (items.length > 0) {
				await trx.insert(devCycleItems).values(items.map((i) => ({ ...i, entry_id: id })));
			}
		});
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
