import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
	if (request.headers.get('Authorization') !== process.env.ADMIN_KEY)
		return json({ error: 'Unauthorized' }, { status: 401 });

	const { userId, iq } = await request.json();
	if (!userId || iq === undefined)
		return json({ error: 'Missing userId or iq' }, { status: 400 });

	const [updated] = await db
		.update(users)
		.set({ iq })
		.where(eq(users.id, userId))
		.returning({ id: users.id, handle: users.handle, iq: users.iq });

	if (!updated) return json({ error: 'User not found' }, { status: 404 });
	return json({ message: 'IQ updated', user: updated });
};
