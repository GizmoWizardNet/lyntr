import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { deleteApiClient } from '@/server/apiClients';

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

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		await deleteApiClient(userId, params.id!);
		return json({ success: true });
	} catch (e: any) {
		return json({ error: e?.message || 'Failed to delete credential.' }, { status: 400 });
	}
};
