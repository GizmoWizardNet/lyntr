import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { devCycleNotes } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/server/forum';

// Admin CRUD for the "glass bubble" notes pinned to commits on the
// /updates commit graph. Same cookie + is_admin auth pattern as
// api/admin/devcycle/+server.ts.

export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	let body: { commitSha?: string; note?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const commitSha = body.commitSha?.trim();
	const note = body.note?.trim();
	if (!commitSha || commitSha.length !== 40) {
		return json({ error: 'commitSha must be a full 40-char SHA' }, { status: 400 });
	}
	if (!note) return json({ error: 'Missing note' }, { status: 400 });

	const [created] = await db
		.insert(devCycleNotes)
		.values({ commit_sha: commitSha, note, author_id: auth.userId })
		.returning();

	return json({ note: created }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	const { id, note } = await request.json();
	if (!id) return json({ error: 'Missing id' }, { status: 400 });
	if (!note?.trim()) return json({ error: 'Missing note' }, { status: 400 });

	const [updated] = await db
		.update(devCycleNotes)
		.set({ note: note.trim() })
		.where(eq(devCycleNotes.id, id))
		.returning();

	if (!updated) return json({ error: 'Not found' }, { status: 404 });
	return json({ note: updated });
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const auth = await requireAuth(cookies);
	if (auth instanceof Response) return auth;
	if (!auth.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

	const { id } = await request.json();
	if (!id) return json({ error: 'Missing id' }, { status: 400 });

	await db.delete(devCycleNotes).where(eq(devCycleNotes.id, id));
	return json({ ok: true });
};
