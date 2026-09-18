import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getCurrentUser } from '@/server/auth';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const user = await getCurrentUser(request, cookies);

	if (!user) {
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	return json(user, { status: 200 });
};
