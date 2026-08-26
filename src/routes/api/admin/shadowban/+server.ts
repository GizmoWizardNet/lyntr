import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

// Note: shadowban requires a `shadowbanned` boolean column on users.
// Add to schema.ts and run:
//   ALTER TABLE users ADD COLUMN IF NOT EXISTS shadowbanned BOOLEAN NOT NULL DEFAULT FALSE;

export const POST: RequestHandler = async ({ request }) => {
	if (request.headers.get('Authorization') !== process.env.ADMIN_KEY)
		return json({ error: 'Unauthorized' }, { status: 401 });

	const { userId } = await request.json();
	if (!userId) return json({ error: 'Missing userId' }, { status: 400 });

	const [updated] = await db
		.update(users)
		.set({ shadowbanned: true } as any)
		.where(eq(users.id, userId))
		.returning({ id: users.id, handle: users.handle });

	if (!updated) return json({ error: 'User not found' }, { status: 404 });
	return json({ message: 'User shadowbanned', user: updated });
};
