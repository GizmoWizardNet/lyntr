import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { scrollableFeed } from '@/server/scrollables';

export const GET: RequestHandler = async ({ request, url }) => {
    // basically the same as /api/scrollables
	const auth = await authenticateApiRequest(request);
    if (isApiAuthResponse(auth)) return auth;

    const before = url.searchParams.get('before');
    const minIqParam = url.searchParams.get('minIq');
    const minIq = minIqParam ? parseInt(minIqParam, 10) : null;

	return json({ scrollables: await scrollableFeed(auth.userId, before, Number.isFinite(minIq) ? minIq : null) });
};
