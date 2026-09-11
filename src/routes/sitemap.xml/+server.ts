import type { RequestHandler } from './$types';
import { db } from '@/server/db';
import { users, lynts } from '@/server/schema';
import { desc, eq, max, sql } from 'drizzle-orm';
import { PUBLIC_ORIGIN } from '$env/static/public';

// Fallback in case PUBLIC_ORIGIN isn't set in a given environment (it is in
// prod — see .env.example — but this keeps local/dev builds from crashing).
const ORIGIN = PUBLIC_ORIGIN || 'https://lyntr.gizmowizard.tech';

// Static, non-dynamic pages worth listing. Anything gated behind auth
// (settings, DMs, admin, individual lynt modals opened via ?id=) is
// deliberately left out — a crawler can't do anything useful with those
// and scrollables/[id] requires a logged-in viewer (see requireUser in its
// +page.server.ts), so it's not crawlable either.
const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
	{ path: '/', changefreq: 'hourly', priority: '1.0' },
	{ path: '/about', changefreq: 'monthly', priority: '0.5' },
	{ path: '/updates', changefreq: 'weekly', priority: '0.5' },
	{ path: '/downloads', changefreq: 'monthly', priority: '0.4' },
	{ path: '/developer', changefreq: 'monthly', priority: '0.4' },
	{ path: '/privacy', changefreq: 'yearly', priority: '0.2' },
	{ path: '/tos', changefreq: 'yearly', priority: '0.2' }
];

function xmlEscape(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export const GET: RequestHandler = async () => {
	// One row per non-banned user, carrying the most recent lynt's
	// created_at (falling back to account creation) so <lastmod> reflects
	// actual profile activity instead of always pointing at "now".
	const profiles = await db
		.select({
			handle: users.handle,
			createdAt: users.created_at,
			lastLyntAt: max(lynts.created_at)
		})
		.from(users)
		.leftJoin(lynts, eq(lynts.user_id, users.id))
		.where(sql`${users.banned} is not true`)
		.groupBy(users.id, users.handle, users.created_at)
		.orderBy(desc(sql`coalesce(max(${lynts.created_at}), ${users.created_at})`));

	const staticEntries = STATIC_ROUTES.map(
		({ path, changefreq, priority }) => `\t<url>
\t\t<loc>${xmlEscape(ORIGIN + path)}</loc>
\t\t<changefreq>${changefreq}</changefreq>
\t\t<priority>${priority}</priority>
\t</url>`
	);

	const profileEntries = profiles.map(({ handle, createdAt, lastLyntAt }) => {
		const lastmod = new Date(lastLyntAt ?? createdAt ?? Date.now()).toISOString();
		return `\t<url>
\t\t<loc>${xmlEscape(`${ORIGIN}/@${handle}`)}</loc>
\t\t<lastmod>${lastmod}</lastmod>
\t\t<changefreq>daily</changefreq>
\t\t<priority>0.6</priority>
\t</url>`;
	});

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...profileEntries].join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			// Sitemaps don't need to be fresh-to-the-second; an hour of CDN/
			// browser caching keeps this off the DB on every crawler hit.
			'Cache-Control': 'public, max-age=3600'
		}
	});
};