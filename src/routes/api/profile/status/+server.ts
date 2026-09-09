import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { moderateContent } from '@/moderation';

const MAX_STATUS_LENGTH = 100;

const DURATION_MINUTES: Record<string, number | null> = {
	'30m': 30,
	'1h': 60,
	'4h': 60 * 4,
	'24h': 60 * 24,
	'7d': 60 * 24 * 7,
	forever: null
};

export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const [row] = await db
		.select({ status_text: users.status_text, status_expires_at: users.status_expires_at })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	const expired =
		row?.status_expires_at && new Date(row.status_expires_at).getTime() <= Date.now();

	return json({
		status_text: expired ? null : (row?.status_text ?? null),
		status_expires_at: expired ? null : (row?.status_expires_at ?? null)
	});
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const body = await request.json();

	// Clearing the status — either an explicit empty string or null text.
	if (body.status_text === null || body.status_text === '') {
		await db
			.update(users)
			.set({ status_text: null, status_expires_at: null })
			.where(eq(users.id, userId));
		return json({ status_text: null, status_expires_at: null });
	}

	const statusText = String(body.status_text).trim().slice(0, MAX_STATUS_LENGTH);
	if (!statusText) {
		return json({ error: 'Status cannot be empty' }, { status: 400 });
	}

	const verdict = await moderateContent(statusText);
	if (!verdict.allowed) {
		return json({ error: verdict.reason }, { status: 400 });
	}

	const durationKey = String(body.duration ?? 'forever');
	if (!(durationKey in DURATION_MINUTES)) {
		return json({ error: 'Invalid duration' }, { status: 400 });
	}
	const minutes = DURATION_MINUTES[durationKey];
	const expiresAt = minutes === null ? null : new Date(Date.now() + minutes * 60_000);

	await db
		.update(users)
		.set({ status_text: statusText, status_expires_at: expiresAt })
		.where(eq(users.id, userId));

	return json({ status_text: statusText, status_expires_at: expiresAt });
};