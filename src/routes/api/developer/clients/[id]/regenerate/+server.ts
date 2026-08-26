import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { regenerateApiClientSecret } from '@/server/apiClients';
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

export const POST: RequestHandler = async ({ params, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	try {
		const result = await regenerateApiClientSecret(userId, params.id!);
		// client_secret is included here ONLY on regeneration — never again.
		return json(result);
	} catch (e: any) {
		return json({ error: e?.message || 'Failed to regenerate secret.' }, { status: 400 });
	}
};
