/**
 * src/lib/server/hashtags.ts  –  #hashtag extraction & persistence
 *
 * Used by:
 *   - src/routes/api/lynt/+server.ts     (POST: new lynt, PATCH: edit)
 *   - src/routes/api/comment/+server.ts  (POST: new comment)
 *
 * Behaviour:
 *   - Extracts #tag tokens from raw post text (same regex family the
 *     client uses for highlighting in ParsedContent.svelte — kept in sync).
 *   - Tags are lowercased and stored without the leading '#'.
 *   - On every create/edit, replaces the lynt's hashtag rows wholesale
 *     (delete-then-insert) rather than diffing — simpler, and cheap since
 *     a lynt has at most a handful of tags.
 */

import { db } from './db';
import { lyntHashtags } from './schema';
import { eq } from 'drizzle-orm';

// A hashtag starts with a letter (not a digit — "#1" isn't a tag, it's
// probably a rank/count), then letters/digits/underscore, 1-49 more chars.
// Must not be glued to a preceding word character (so a literal "C#" in
// text, or a URL fragment, isn't misread as a tag).
const HASHTAG_REGEX = /(?<![A-Za-z0-9_#])#([A-Za-z][A-Za-z0-9_]{0,49})(?![A-Za-z0-9_])/g;

/** Extract unique, lowercase-normalised tags (no leading '#') from raw text. */
export function extractHashtags(text: string): string[] {
	if (!text) return [];
	const found = new Set<string>();
	let match: RegExpExecArray | null;
	HASHTAG_REGEX.lastIndex = 0;
	while ((match = HASHTAG_REGEX.exec(text)) !== null) {
		found.add(match[1].toLowerCase());
	}
	return Array.from(found);
}

/**
 * Re-derive and persist a lynt's hashtags from its current content. Call
 * this after the lynt/comment row already exists (create) or has been
 * updated (edit) in the DB.
 */
export async function processHashtags(content: string, lyntId: string) {
	const tags = extractHashtags(content);

	// Wholesale replace — cheap at this scale and avoids diffing logic.
	await db.delete(lyntHashtags).where(eq(lyntHashtags.lynt_id, lyntId));
	if (tags.length === 0) return;

	await db.insert(lyntHashtags).values(tags.map((tag) => ({ lynt_id: lyntId, tag })));
}
