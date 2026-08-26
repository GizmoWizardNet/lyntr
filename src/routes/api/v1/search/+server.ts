import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { lynts, users } from '@/server/schema';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { lyntObj, hydratePolls } from '../../util';

// GET /api/v1/search?q=... — simple content search (plain substring match).
// For the full operator syntax (from:, #tag, etc.) use the app itself for now.
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const q = url.searchParams.get('q')?.trim();
	if (!q) return json({ error: 'Missing required query parameter: q' }, { status: 400 });

	const results = await db
		.select(lyntObj(auth.userId))
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(and(ilike(lynts.content, `%${q}%`), eq(lynts.reposted, false)))
		.orderBy(desc(lynts.created_at))
		.limit(50);

	return json({ lynts: hydratePolls(results) });
};
