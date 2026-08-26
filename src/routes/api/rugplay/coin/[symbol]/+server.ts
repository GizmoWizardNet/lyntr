import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { resolveRugplayKeyForHandle } from '@/server/rugplayKeys';

// In-process cache: symbol -> { data, expiresAt }
const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 30_000; // 30 seconds — Rugplay has 2k/day limit so we cache aggressively

export const GET: RequestHandler = async ({ params, url }) => {
	const symbol = params.symbol?.toUpperCase();
	if (!symbol) return json({ error: 'Missing symbol' }, { status: 400 });

	// authorHandle = the handle of whoever posted the Lynt this $SYMBOL came
	// from. If they've opted into Rugplay Enhancements with a valid key, we
	// use THEIR key (their own quota) instead of the shared site key.
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
		apiKey = lookup.apiKey; // server-side only — never echoed back to the client
	} else {
		// Backward-compatible fallback: shared site key.
		apiKey = process.env.RUGPLAY_API_KEY;
	}

	if (!apiKey) return json({ error: 'Rugplay API key not configured' }, { status: 503 });

	// Serve from cache if fresh. Coin data is public/shared regardless of
	// whose key fetched it, so caching by symbol alone is fine here.
	const cached = cache.get(symbol);
	if (cached && Date.now() < cached.expiresAt) {
		return json(cached.data);
	}

	try {
		const res = await fetch(`https://rugplay.com/api/v1/coin/${symbol}`, {
			headers: { Authorization: `Bearer ${apiKey}` }
		});

		if (res.status === 404) return json({ error: 'Coin not found' }, { status: 404 });
		if (res.status === 429) return json({ error: 'Rate limited' }, { status: 429 });
		if (!res.ok) return json({ error: 'Rugplay API error' }, { status: 502 });

		const data = await res.json();
		cache.set(symbol, { data: { status: 'ok', ...data }, expiresAt: Date.now() + CACHE_TTL });
		return json({ status: 'ok', ...data });
	} catch (err) {
		console.error('Rugplay proxy error:', err);
		return json({ error: 'Failed to fetch coin data' }, { status: 502 });
	}
};


