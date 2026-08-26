import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { lynts, users, lyntHashtags } from '@/server/schema';
import { sql, and, eq, ilike, desc } from 'drizzle-orm';
import { verifyAuthJWT } from '@/server/jwt';
import { lyntObj, hydratePolls } from '../util';

// ---------------------------------------------------------------------------
// Query syntax
// ---------------------------------------------------------------------------
// Plain text            -> ILIKE match against lynt content (unchanged
//                          from before).
// from:@handle           -> only lynts by that author (exact handle match,
//                          case-insensitive; the leading @ is optional).
// content:word           -> explicit form of the plain-text match, for
//                          when it needs to sit alongside other operators.
// #tag / tag:tag         -> only lynts carrying that hashtag (see
//                          src/lib/server/hashtags.ts for extraction).
//
// Operators can be combined and are ANDed together, e.g.
// "from:@ada content:c-plus-plus" or "from:@ada #cpp". Anything that isn't
// a recognized operator is treated as a plain-text content term, so a
// query can freely mix bare words with operators.
// ---------------------------------------------------------------------------

interface ParsedQuery {
	from?: string;
	tag?: string;
	contentTerms: string[];
}

function parseSearchQuery(raw: string): ParsedQuery {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	const parsed: ParsedQuery = { contentTerms: [] };

	for (const token of tokens) {
		const fromMatch = token.match(/^from:@?([A-Za-z0-9_]{1,32})$/i);
		if (fromMatch) {
			parsed.from = fromMatch[1].toLowerCase();
			continue;
		}

		const tagOperatorMatch = token.match(/^tag:#?([A-Za-z][A-Za-z0-9_]{0,49})$/i);
		const bareTagMatch = token.match(/^#([A-Za-z][A-Za-z0-9_]{0,49})$/);
		if (tagOperatorMatch || bareTagMatch) {
			parsed.tag = (tagOperatorMatch?.[1] ?? bareTagMatch?.[1] ?? '').toLowerCase();
			continue;
		}

		const contentMatch = token.match(/^content:(.+)$/i);
		if (contentMatch) {
			parsed.contentTerms.push(contentMatch[1]);
			continue;
		}

		parsed.contentTerms.push(token);
	}

	return parsed;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const query = url.searchParams.get('q');
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!query) {
		return json({ error: 'Missing search query' }, { status: 400 });
	}

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);

		if (!jwtPayload.userId) {
			throw new Error('Invalid JWT token');
		}

		const userId = jwtPayload.userId;
		const parsed = parseSearchQuery(query);

		const conditions = [eq(users.banned, false)];

		if (parsed.from) {
			conditions.push(sql`lower(${users.handle}) = ${parsed.from}`);
		}
		if (parsed.tag) {
			conditions.push(sql`exists(
				select 1 from ${lyntHashtags}
				where ${lyntHashtags.lynt_id} = ${lynts.id} and ${lyntHashtags.tag} = ${parsed.tag}
			)`);
		}
		if (parsed.contentTerms.length > 0) {
			conditions.push(ilike(lynts.content, `%${parsed.contentTerms.join(' ')}%`));
		}

		// Every query above always carries the banned-user exclusion, so a
		// "real" search needs at least one more condition — otherwise
		// someone could search for literally nothing (e.g. a query that's
		// only whitespace) and get every lynt back.
		if (conditions.length === 1) {
			return json({ error: 'Missing search query' }, { status: 400 });
		}

		const searchResults = await db
			.select({ ...lyntObj(userId) })
			.from(lynts)
			.leftJoin(users, eq(lynts.user_id, users.id))
			.where(and(...conditions))
			.orderBy(desc(lynts.created_at))
			.limit(50);

		// Increment view counts in the background
		incrementViewCounts(searchResults.map((result) => result.id));

		return json(hydratePolls(searchResults), { status: 200 });
	} catch (error) {
		console.error('Error performing search:', error);
		return json({ error: 'Failed to perform search' }, { status: 500 });
	}
};

async function incrementViewCounts(lyntIds: string[]) {
	try {
		await db.transaction(async (tx) => {
			await Promise.all(
				lyntIds.map((id) => tx.execute(sql`UPDATE ${lynts} SET views = views + 1 WHERE id = ${id}`))
			);
		});
	} catch (error) {
		console.error('Error incrementing view counts:', error);
	}
}
