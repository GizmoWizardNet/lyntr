import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { pollVotes, users } from '@/server/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/poll/:option_id/voters
 *
 * Backs the hover dropdown on a poll option (see PollOptionVotersDropdown.svelte),
 * mirroring /api/lynt/:id/likers exactly: no auth required (who voted for a
 * public poll option isn't sensitive, same as vote counts being public),
 * capped small and unpaginated since this is a hover preview, not a full page.
 */
export const GET: RequestHandler = async ({ params }) => {
	const optionId = params.option_id;
	if (!optionId) return json({ error: 'Missing option ID' }, { status: 400 });

	const LIMIT = 8;

	try {
		const rows = await db
			.select({
				id: users.id,
				handle: users.handle,
				username: users.username,
				verified: users.verified,
				nameColor: users.name_color,
				votedAt: pollVotes.voted_at
			})
			.from(pollVotes)
			.innerJoin(users, eq(pollVotes.user_id, users.id))
			.where(eq(pollVotes.option_id, optionId))
			.orderBy(desc(pollVotes.voted_at))
			// Fetch one extra so we can tell the dropdown "there are more"
			// without a separate count query.
			.limit(LIMIT + 1);

		const voters = rows.slice(0, LIMIT).map(({ votedAt, ...u }) => u);

		return json({ voters, hasMore: rows.length > LIMIT });
	} catch (error) {
		console.error('Error fetching poll option voters:', error);
		return json({ error: 'Failed to fetch voters' }, { status: 500 });
	}
};