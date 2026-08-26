import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';

// Proxy Klipy's GIF API so we never expose the key to the client.
// Set KLIPY_API_KEY in your .env file (free key from partner.klipy.com).
//
// Klipy replaces Tenor here because Google is discontinuing the public
// Tenor API. Klipy was built specifically as a drop-in-shaped Tenor
// replacement (free tier, similar search/trending concepts).
//
// ── A note on field mapping ─────────────────────────────────────────────
// docs.klipy.com is a JS-rendered docs site that couldn't be crawled to
// get an exact response schema. The shape below (`files.<size>.gif.url`,
// `data.data`, `has_next`, etc.) is assembled from Klipy's public
// migration guides and third-party integration write-ups, not a verified
// spec. `pickUrl`/`pickPreview`/`pickDims` probe a few plausible paths so
// this degrades gracefully if a field is named slightly differently.
//
// TO VERIFY: once you have a real KLIPY_API_KEY, hit this endpoint once,
// temporarily add `console.log(JSON.stringify(data, null, 2))` right
// after the fetch below, and check a single GIF item's shape against
// pickUrl/pickPreview/pickDims. That's the only place a mapping fix would
// go — everything downstream (GifPicker.svelte, the lynt/DM composers)
// only depends on the {id,title,url,preview_url,width,height} shape this
// endpoint returns, which is unchanged from the old Tenor proxy.
// ─────────────────────────────────────────────────────────────────────────

const KLIPY_BASE = 'https://api.klipy.com/api/v1';

function pickUrl(item: any): string | null {
	return (
		item?.file?.md?.gif?.url ??
		item?.files?.md?.gif?.url ??
		item?.file?.hd?.gif?.url ??
		item?.files?.hd?.gif?.url ??
		item?.file?.gif?.url ??
		item?.files?.gif?.url ??
		item?.url ??
		null
	);
}

function pickPreview(item: any): string | null {
	return (
		item?.file?.sm?.gif?.url ??
		item?.files?.sm?.gif?.url ??
		item?.file?.xs?.gif?.url ??
		item?.files?.xs?.gif?.url ??
		item?.preview_url ??
		pickUrl(item)
	);
}

function pickDims(item: any): { width: number; height: number } {
	const f =
		item?.file?.md?.gif ?? item?.files?.md?.gif ?? item?.file?.gif ?? item?.files?.gif ?? {};
	return { width: Number(f.width) || 200, height: Number(f.height) || 200 };
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
	let userId: string;
	try {
		userId = (await verifyAuthJWT(token)).userId;
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const apiKey = process.env.KLIPY_API_KEY;
	if (!apiKey) return json({ error: 'GIF search not configured' }, { status: 503 });

	const q = url.searchParams.get('q');
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50);
	// Reuses the old `pos` query param name (opaque Tenor cursor) as a
	// 1-based page number, so GifPicker.svelte needed zero changes here.
	const page = Number(url.searchParams.get('pos')) || 1;

	const endpoint = q
		? `${KLIPY_BASE}/${apiKey}/gifs/search?q=${encodeURIComponent(q)}&customer_id=${encodeURIComponent(userId)}&per_page=${limit}&page=${page}`
		: `${KLIPY_BASE}/${apiKey}/gifs/trending?customer_id=${encodeURIComponent(userId)}&per_page=${limit}&page=${page}`;

	const res = await fetch(endpoint);
	if (!res.ok) return json({ error: 'Klipy API error' }, { status: 502 });
	const data = await res.json();

	// TO VERIFY: uncomment to inspect a real response shape —
	// console.log(JSON.stringify(data, null, 2));

	const items: any[] = data?.data?.data ?? data?.data ?? [];

	const results = items
		.map((item) => ({
			id: String(item.id ?? item.slug ?? item.uuid ?? Math.random()),
			title: item.title ?? '',
			url: pickUrl(item),
			preview_url: pickPreview(item),
			...pickDims(item)
		}))
		.filter((r) => !!r.url);

	const hasNext = data?.data?.has_next ?? false;

	return json({ results, next: hasNext ? String(page + 1) : '' });
};
