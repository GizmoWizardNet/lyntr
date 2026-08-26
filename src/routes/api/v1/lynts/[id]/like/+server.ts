import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, likes } from '@/server/schema';
import { eq, and, count } from 'drizzle-orm';
import { createNotification } from '@/server/notifications';
import { awardLikeReceived } from '@/server/lyntcoins';

export const POST: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const lyntId = params.id!;
	const [lynt] = await db.select({ id: lynts.id, user_id: lynts.user_id }).from(lynts).where(eq(lynts.id, lyntId)).limit(1);
	if (!lynt) return json({ error: 'Lynt not found' }, { status: 404 });

	const [existing] = await db
		.select()
		.from(likes)
		.where(and(eq(likes.lynt_id, lyntId), eq(likes.user_id, auth.userId)))
		.limit(1);

	if (existing) return json({ liked: true, message: 'Already liked.' });

	const [{ likeCountBefore }] = await db
		.select({ likeCountBefore: count() })
		.from(likes)
		.where(eq(likes.lynt_id, lyntId));

	await db.insert(likes).values({ lynt_id: lyntId, user_id: auth.userId });

	try {
		if (lynt.user_id && lynt.user_id !== auth.userId) {
			await createNotification(lynt.user_id, 'like', auth.userId, lyntId);
			await awardLikeReceived(lynt.user_id, auth.userId, lyntId, likeCountBefore);
		}
	} catch (e) {
		console.error('v1 like side-effects error:', e);
	}

	return json({ liked: true });
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const lyntId = params.id!;
	await db.delete(likes).where(and(eq(likes.lynt_id, lyntId), eq(likes.user_id, auth.userId)));

	return json({ liked: false });
};
