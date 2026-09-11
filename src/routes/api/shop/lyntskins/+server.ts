import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { users, userLyntskins } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { LYNTSKIN_CATALOG } from '$lib/lyntskins';

export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const [owned, [me]] = await Promise.all([
		db.select({ skin_key: userLyntskins.skin_key }).from(userLyntskins).where(eq(userLyntskins.user_id, userId)),
		db.select({ lynt_coins: users.lynt_coins }).from(users).where(eq(users.id, userId)).limit(1)
	]);

	const ownedKeys = new Set(owned.map((o) => o.skin_key));

	return json({
		balance: me?.lynt_coins ?? 0,
		skins: LYNTSKIN_CATALOG.map((s) => ({ ...s, owned: ownedKeys.has(s.key) }))
	});
};