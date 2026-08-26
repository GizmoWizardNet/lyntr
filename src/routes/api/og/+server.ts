import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// In-process cache: url -> { data, expiresAt }
const cache = new Map<string, { data: OgData | OgError; expiresAt: number }>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

export interface OgData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}
interface OgError { error: string }

function extractMeta(html: string, url: string): OgData {
  const get = (pattern: RegExp) => {
    const m = html.match(pattern);
    return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : undefined;
  };

  const origin = new URL(url).origin;

  const title =
    get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
    get(/<title[^>]*>([^<]+)<\/title>/i);

  const description =
    get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
    get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

  let image =
    get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (image && image.startsWith('/')) image = origin + image;

  const siteName =
    get(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i) ||
    new URL(url).hostname.replace(/^www\./, '');

  let favicon =
    get(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
    get(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
  if (favicon && favicon.startsWith('/')) favicon = origin + favicon;
  if (!favicon) favicon = `${origin}/favicon.ico`;

  return { url, title, description, image, siteName, favicon };
}

export const GET: RequestHandler = async ({ url }) => {
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'Missing url param' }, { status: 400 });

  // Only fetch http(s) URLs
  let parsed: URL;
  try {
    parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Bad protocol');
  } catch {
    return json({ error: 'Invalid URL' }, { status: 400 });
  }

  const cached = cache.get(target);
  if (cached && Date.now() < cached.expiresAt) return json(cached.data);

  try {
    const res = await fetch(parsed.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Lyntr/1.0; +https://lyntr.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const err: OgError = { error: `HTTP ${res.status}` };
      cache.set(target, { data: err, expiresAt: Date.now() + 60_000 });
      return json(err, { status: 502 });
    }

    // Only parse the first 50 KB — OG tags are always in <head>
    const reader = res.body?.getReader();
    let html = '';
    let bytes = 0;
    if (reader) {
      const decoder = new TextDecoder();
      while (bytes < 50_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        bytes += value.byteLength;
        // Stop as soon as we've passed </head>
        if (html.includes('</head>')) break;
      }
      reader.cancel();
    }

    const data = extractMeta(html, parsed.href);
    cache.set(target, { data, expiresAt: Date.now() + CACHE_TTL });
    return json(data);
  } catch (err: any) {
    const out: OgError = { error: err?.message ?? 'Fetch failed' };
    cache.set(target, { data: out, expiresAt: Date.now() + 30_000 });
    return json(out, { status: 502 });
  }
};
