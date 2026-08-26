import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { listApiClients, createApiClient } from '@/server/apiClients';
import { sensitiveRatelimit } from '@/server/ratelimit';

async function requireUser(cookies: any) {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return null;
	try {
		const payload = await verifyAuthJWT(token);
		return payload.userId ?? null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	const clients = await listApiClients(userId);
	return json({ clients });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const body = await request.json().catch(() => ({}));
	const name = typeof body?.name === 'string' ? body.name.slice(0, 60) : 'Default';

	try {
		const created = await createApiClient(userId, name);
		// client_secret is included here ONLY on creation — never again.
		return json(created, { status: 201 });
	} catch (e: any) {
		return json({ error: e?.message || 'Failed to create credential.' }, { status: 400 });
	}
};
