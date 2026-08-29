import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { getScrollable } from '@/server/scrollables';
import { db } from '@/server/db';
import { scrollables } from '@/server/schema';
import { eq, sql } from 'drizzle-orm';


export const GET: RequestHandler = async ({ request, params }) => {
    const auth = await authenticateApiRequest(request);
    if (isApiAuthResponse(auth)) return auth;

    const row = await getScrollable(params.id!, auth.userId);
	if (!row) return json({ error: 'Not found' }, { status: 404 });

	// don't increment the view counter for scrollables returned
	// by the api, matching /lynts/[id]

	return json({ scrollable: row });
};
