import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getFeaturedLynt } from '@/server/featured';

let cache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL = 60_000; // most-liked-in-24h doesn't need to be second-fresh lmao

export const GET: RequestHandler = async () => {
	if (cache && Date.now() < cache.expiresAt) {
		return json(cache.data);
	}

	const featured = await getFeaturedLynt();
	if (!featured) return json({ error: 'No lynts found' }, { status: 404 });

	cache = { data: featured, expiresAt: Date.now() + CACHE_TTL };
	return json(featured);
};