import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getFeaturedLynt } from '@/server/featured';

export const GET: RequestHandler = async ({ request }) => {
	if (request.headers.get('Authorization') !== process.env.ADMIN_KEY)
		return json({ error: 'Unauthorized' }, { status: 401 });

	const featured = await getFeaturedLynt();
	if (!featured) return json({ error: 'No lynts found' }, { status: 404 });
	return json(featured);
};