import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { normalRatelimit } from '@/server/ratelimit';
import { toggleScrollableBookmark } from '@/server/scrollables';
import { broadcastScrollableBookmarkUpdate } from '$lib/ws';

export const POST: RequestHandler = async ({ params, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const { success } = await normalRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	try {
		const result = await toggleScrollableBookmark(params.id!, userId);
		broadcastScrollableBookmarkUpdate(userId, params.id!, result.bookmarked);
		return json(result);
	} catch (e) {
		if (e instanceof Error && e.message === 'NOT_FOUND') return json({ error: 'Not found' }, { status: 404 });
		throw e;
	}
};
