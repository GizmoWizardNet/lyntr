import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { users, userLyntskins, lcTransactions } from '@/server/schema';
import { eq, and, sql } from 'drizzle-orm';
import { LYNTSKIN_BY_KEY, isValidLyntskinKey } from '$lib/lyntskins';
import { sensitiveRatelimit } from '@/server/ratelimit';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const body = await request.json().catch(() => null);
	const key = body?.key;

	if (!isValidLyntskinKey(key)) {
		return json({ error: 'Unknown lyntskin.' }, { status: 400 });
	}

	const [alreadyOwned] = await db
		.select({ skin_key: userLyntskins.skin_key })
		.from(userLyntskins)
		.where(and(eq(userLyntskins.user_id, userId), eq(userLyntskins.skin_key, key)))
		.limit(1);

	if (alreadyOwned) {
		return json({ error: 'You already own this lyntskin.' }, { status: 400 });
	}

	const price = LYNTSKIN_BY_KEY[key].price;

	try {
		await db.transaction(async (tx) => {
			// Atomic balance check-and-deduct: the WHERE clause re-verifies
			// the balance at write time, so two concurrent purchase requests
			// can't both pass an earlier read-time check and double-spend
			// the same XP.
			const updated = await tx
				.update(users)
				.set({ lynt_coins: sql`${users.lynt_coins} - ${price}` })
				.where(and(eq(users.id, userId), sql`${users.lynt_coins} >= ${price}`))
				.returning({ lynt_coins: users.lynt_coins });

			if (updated.length === 0) {
				throw new Error('INSUFFICIENT_XP');
			}

			await tx.insert(userLyntskins).values({ user_id: userId, skin_key: key });
			await tx.insert(lcTransactions).values({
				user_id: userId,
				amount: -price,
				reason: 'lyntskin_purchase'
			});
		});
	} catch (e) {
		if (e instanceof Error && e.message === 'INSUFFICIENT_XP') {
			return json({ error: 'Not enough Community XP.' }, { status: 400 });
		}
		console.error('Lyntskin purchase error:', e);
		return json({ error: 'Failed to complete purchase.' }, { status: 500 });
	}

	return json({ purchased: key }, { status: 201 });
};