import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { resolveRugplayKeyForHandle } from '@/server/rugplayKeys';

/**
 * "Biggest bag" badge
 * -------------------
 * Rugplay's public API (as of writing) has no per-user portfolio/net-worth
 * endpoint — only `holders/{symbol}` (top holders of ONE coin at a time).
 * So instead of a real total net worth, we scan the top N coins by market
 * cap and report the single largest holding we find for the linked
 * Rugplay username. It's a flex badge, not a balance sheet.
 *
 * Rugplay's key is rate-limited to 2,000 req/day shared across all of
 * Lyntr, so results are cached hard per-username and the scan width is
 * capped. Tune via env if you want a wider/narrower scan.
 */

// Tunable via env. Defaults are deliberately conservative — this is a
// flex badge, not critical functionality, so it should fail fast and
// cheap rather than risk hanging the whole request (which is what was
// causing upstream 502s: a single slow/hung rugplay.com call with no
// timeout could block the response indefinitely).
const SCAN_LIMIT = Math.min(parseInt(process.env.RUGPLAY_NETWORTH_SCAN_LIMIT ?? '15', 10) || 15, 100);
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — this is a flex badge, not a live ticker
const PER_REQUEST_TIMEOUT_MS = 6_000; // any single rugplay.com call gets cut off here
const OVERALL_DEADLINE_MS = 20_000; // whole scan gives up and returns best-so-far past this
const CONCURRENCY = 5; // holder lookups run in small parallel batches instead of strictly serial

type Badge =
	| { linked: false }
	| { linked: true; found: false; scannedCoins: number }
	| {
			linked: true;
			found: true;
			coin: { symbol: string; name: string; icon: string };
			quantity: number;
			value: number;
			rank: number;
			percentage: number;
			scannedCoins: number;
	  };

// username -> { data, expiresAt }
const cache = new Map<string, { data: Badge; expiresAt: number }>();

async function rugplayFetch(path: string, apiKey: string) {
	const res = await fetch(`https://rugplay.com/api/v1/${path}`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Rugplay API error ${res.status} on ${path}`);
	return res.json();
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

export const GET: RequestHandler = async ({ params }) => {
	const handle = params.handle;
	if (!handle) return json({ error: 'Missing handle' }, { status: 400 });

	const [user] = await db
		.select({ rugplay_username: users.rugplay_username })
		.from(users)
		.where(eq(users.handle, handle))
		.limit(1);

	if (!user) return json({ error: 'User not found' }, { status: 404 });

	const rugplayUsername = user.rugplay_username;
	if (!rugplayUsername) return json({ linked: false } satisfies Badge);

	const cacheKey = rugplayUsername.toLowerCase();
	const cached = cache.get(cacheKey);
	if (cached && Date.now() < cached.expiresAt) {
		return json(cached.data);
	}

	const apiKey = await (async () => {
		// This badge is always about the PROFILE OWNER's own holdings, so it
		// should use THEIR key (if they've opted into Enhancements) before
		// touching the shared site key — otherwise the whole point of
		// Enhancements (offloading quota usage to users who bring their own
		// key) is defeated for this feature specifically.
		const own = await resolveRugplayKeyForHandle(handle);
		if (own.status === 'ok') return own.apiKey;
		return process.env.RUGPLAY_API_KEY;
	})();
	if (!apiKey) return json({ error: 'Rugplay API key not configured' }, { status: 503 });

	const deadline = Date.now() + OVERALL_DEADLINE_MS;

	try {
		const market = await rugplayFetch(
			`market?sortBy=marketCap&sortOrder=desc&limit=${SCAN_LIMIT}&page=1`,
			apiKey
		);
		const coins: { symbol: string; name: string; icon: string }[] = market.coins ?? [];

		let best: Badge | null = null;
		let scanned = 0;

		for (const batch of chunk(coins, CONCURRENCY)) {
			if (Date.now() > deadline) break; // ran out of time — return whatever we've found so far

			const results = await Promise.allSettled(
				batch.map((coin) => rugplayFetch(`holders/${coin.symbol}?limit=200`, apiKey))
			);

			results.forEach((result, i) => {
				scanned++;
				if (result.status !== 'fulfilled') return; // one bad/slow coin shouldn't kill the scan

				const coin = batch[i];
				const holder = (result.value.holders ?? []).find(
					(h: any) => h.username?.toLowerCase() === cacheKey
				);
				if (!holder) return;

				if (!best || (best.linked && best.found && holder.liquidationValue > best.value)) {
					best = {
						linked: true,
						found: true,
						coin: { symbol: coin.symbol, name: coin.name, icon: coin.icon },
						quantity: holder.quantity,
						value: holder.liquidationValue,
						rank: holder.rank,
						percentage: holder.percentage,
						scannedCoins: scanned
					};
				}
			});
		}

		const result: Badge = best ?? { linked: true, found: false, scannedCoins: scanned };
		// Only cache a "not found" result for a short while — it might just
		// mean we hit the deadline before finishing the full scan.
		const ttl = best ? CACHE_TTL : Math.min(CACHE_TTL, 15 * 60 * 1000);
		cache.set(cacheKey, { data: result, expiresAt: Date.now() + ttl });
		return json(result);
	} catch (err) {
		console.error('Rugplay networth scan error:', err);
		return json({ error: 'Failed to compute net worth badge' }, { status: 502 });
	}
};
