import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { pushSubscriptions } from '@/server/schema';
import { and, eq } from 'drizzle-orm';

// POST /api/push/subscribe — save a new PushSubscription for the current user
export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const body = await request.json() as {
		endpoint: string;
		keys: { p256dh: string; auth: string };
	};

	if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
		return json({ error: 'Invalid subscription object' }, { status: 400 });
	}

	const ua = request.headers.get('user-agent')?.slice(0, 200) ?? null;

	await db
		.insert(pushSubscriptions)
		.values({
			user_id: userId,
			endpoint: body.endpoint,
			p256dh: body.keys.p256dh,
			auth: body.keys.auth,
			user_agent: ua,
		})
		.onConflictDoUpdate({
			target: [pushSubscriptions.user_id, pushSubscriptions.endpoint],
			// Refresh keys in case the browser rotated them
			set: { p256dh: body.keys.p256dh, auth: body.keys.auth, user_agent: ua }
		});

	return json({ ok: true }, { status: 201 });
};

// DELETE /api/push/subscribe — remove a subscription (user toggled off on this device)
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try { userId = (await verifyAuthJWT(token)).userId; }
	catch { return json({ error: 'Unauthorized' }, { status: 401 }); }

	const { endpoint } = await request.json() as { endpoint: string };
	if (!endpoint) return json({ error: 'Missing endpoint' }, { status: 400 });

	await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.user_id, userId), eq(pushSubscriptions.endpoint, endpoint)));

	return json({ ok: true });
};

// GET /api/push/subscribe — return the VAPID public key so the client can subscribe
export const GET: RequestHandler = async () => {
	const key = process.env.VAPID_PUBLIC_KEY;
	if (!key) return json({ error: 'Push not configured' }, { status: 503 });
	return json({ publicKey: key });
};
