import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { pollVotes, users } from '@/server/schema';
import { eq, max, desc } from 'drizzle-orm';

/**
 * GET /api/poll/:poll_id/voters
 *
 * Backs the hover dropdown on the "N votes" footer text (see
 * PollOptionVotersDropdown.svelte, reused here poll-wide instead of
 * per-option). A multi-select poll can have several rows per user across
 * options, so this groups by user to list each distinct voter once —
 * that's why it can't just reuse the per-option query as-is.
 */
export const GET: RequestHandler = async ({ params }) => {
	const pollId = params.poll_id;
	if (!pollId) return json({ error: 'Missing poll ID' }, { status: 400 });

	const LIMIT = 8;

	try {
		const rows = await db
			.select({
				id: users.id,
				handle: users.handle,
				username: users.username,
				verified: users.verified,
				nameColor: users.name_color,
				lastVotedAt: max(pollVotes.voted_at)
			})
			.from(pollVotes)
			.innerJoin(users, eq(pollVotes.user_id, users.id))
			.where(eq(pollVotes.poll_id, pollId))
			.groupBy(users.id, users.handle, users.username, users.verified, users.name_color)
			.orderBy(desc(max(pollVotes.voted_at)))
			// Fetch one extra so we can tell the dropdown "there are more"
			// without a separate count query.
			.limit(LIMIT + 1);

		const voters = rows.slice(0, LIMIT).map(({ lastVotedAt, ...u }) => u);

		return json({ voters, hasMore: rows.length > LIMIT });
	} catch (error) {
		console.error('Error fetching poll voters:', error);
		return json({ error: 'Failed to fetch voters' }, { status: 500 });
	}
};
