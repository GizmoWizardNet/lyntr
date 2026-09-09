import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

const VALID_LABELS = ['GMT', 'UTC']; //valid timesets
const OFFSET_PATTERN = /^[+-](0[0-9]|1[0-4]):(00|15|30|45)$/;

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const body = await request.json();

	if (body.timezone_label === null || body.timezone_offset === null) {
		await db
			.update(users)
			.set({ timezone_label: null, timezone_offset: null })
			.where(eq(users.id, userId));
		return json({ timezone_label: null, timezone_offset: null });
	}

	const label = String(body.timezone_label ?? '');
	const offset = String(body.timezone_offset ?? '');

	if (!VALID_LABELS.includes(label)) {
		return json({ error: 'Invalid timezone label' }, { status: 400 });
	}
	if (!OFFSET_PATTERN.test(offset)) {
		return json({ error: 'Invalid timezone offset' }, { status: 400 });
	}

	await db
		.update(users)
		.set({ timezone_label: label, timezone_offset: offset })
		.where(eq(users.id, userId));

	return json({ timezone_label: label, timezone_offset: offset });
};