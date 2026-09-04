import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { resolveRugplayKeyForHandle } from '@/server/rugplayKeys';

const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 30_000;

export const GET: RequestHandler = async ({ params, url }) => {
	const symbol = params.symbol?.toUpperCase();
	if (!symbol) return json({ error: 'Missing symbol' }, { status: 400 });

	const authorHandle = url.searchParams.get('authorHandle');

	let apiKey: string | undefined;

	if (authorHandle) {
		const lookup = await resolveRugplayKeyForHandle(authorHandle);
		if (lookup.status === 'not_enabled') {
			return json({ status: 'disabled', reason: 'not_enabled' });
		}
		if (lookup.status === 'no_valid_key') {
			return json({ status: 'disabled', reason: 'no_valid_key' });
		}
		apiKey = lookup.apiKey;
	} else {
		apiKey = process.env.RUGPLAY_API_KEY;
	}

	if (!apiKey) return json({ error: 'Rugplay API key not configured' }, { status: 503 });
	const cached = cache.get(symbol);
	if (cached && Date.now() < cached.expiresAt) {
		return json(cached.data);
	}

	try {
		const res = await fetch(`https://rugplay.com/api/v1/coin/${symbol}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(6_000)
		});

		if (res.status === 404) return json({ error: 'Coin not found' }, { status: 404 });
		if (res.status === 429) return json({ error: 'Rate limited' }, { status: 429 });
		if (!res.ok) return json({ error: 'Rugplay API error' }, { status: 502 });

		const data = await res.json();
		cache.set(symbol, { data: { status: 'ok', ...data }, expiresAt: Date.now() + CACHE_TTL });
		return json({ status: 'ok', ...data });
	} catch (err) {
		console.error('Rugplay proxy error:', err);
		const stale = cache.get(symbol);
		if (stale) return json(stale.data);
		const timedOut = err instanceof Error && err.name === 'TimeoutError';
		return json(
			{ error: timedOut ? 'Rugplay took too long to respond' : 'Failed to fetch coin data' },
			{ status: 502 }
		);
	}
};