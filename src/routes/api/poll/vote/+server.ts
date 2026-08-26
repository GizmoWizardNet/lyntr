import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { polls, pollOptions, pollVotes } from '@/server/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { broadcastPollUpdate } from '@/sse';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authCookie) return json({ error: 'Unauthorized' }, { status: 401 });

	let userId: string;
	try {
		const payload = await verifyAuthJWT(authCookie);
		userId = payload.userId;
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { poll_id, option_ids } = await request.json() as {
		poll_id: string;
		option_ids: string[]; // array for multi-select; single-element for single-select
	};

	if (!poll_id || !Array.isArray(option_ids) || option_ids.length === 0) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	// Fetch poll and check it's not resolved
	const [poll] = await db
		.select({ id: polls.id, lynt_id: polls.lynt_id, multi_select: polls.multi_select, resolved_at: polls.resolved_at, resolve_at: polls.resolve_at })
		.from(polls)
		.where(eq(polls.id, poll_id))
		.limit(1);

	if (!poll) return json({ error: 'Poll not found' }, { status: 404 });

	// Auto-resolve check
	const now = new Date();
	if (poll.resolved_at || (poll.resolve_at && new Date(poll.resolve_at) < now)) {
		return json({ error: 'This poll has ended' }, { status: 403 });
	}

	// Single-select: only one option allowed
	const selectedIds = poll.multi_select ? option_ids : [option_ids[0]];

	// Verify all option_ids belong to this poll
	const validOptions = await db
		.select({ id: pollOptions.id })
		.from(pollOptions)
		.where(and(eq(pollOptions.poll_id, poll_id), inArray(pollOptions.id, selectedIds)));

	if (validOptions.length !== selectedIds.length) {
		return json({ error: 'Invalid option(s)' }, { status: 400 });
	}

	// Remove any existing votes by this user on this poll (allows changing vote)
	await db.delete(pollVotes).where(
		and(eq(pollVotes.poll_id, poll_id), eq(pollVotes.user_id, userId))
	);

	// Insert new votes
	await db.insert(pollVotes).values(
		selectedIds.map(option_id => ({ poll_id, option_id, user_id: userId }))
	);

	// Live tallies for everyone else looking at this poll — voting had no
	// broadcast at all before, same gap likes/reposts had. Only counts go
	// out here; each viewer's own `voted`/my_votes stays local (the voter
	// already got that via the client's own optimistic update), so this
	// can't leak who voted for what to other viewers.
	try {
		const tally = await db
			.select({ option_id: pollVotes.option_id, votes: sql<number>`count(*)` })
			.from(pollVotes)
			.where(eq(pollVotes.poll_id, poll_id))
			.groupBy(pollVotes.option_id);

		const tallyMap = new Map(tally.map((t) => [t.option_id, Number(t.votes)]));
		const allOptions = await db
			.select({ id: pollOptions.id })
			.from(pollOptions)
			.where(eq(pollOptions.poll_id, poll_id));

		const options = allOptions.map((o) => ({ id: o.id, votes: tallyMap.get(o.id) ?? 0 }));
		const totalVotes = options.reduce((s, o) => s + o.votes, 0);

		broadcastPollUpdate(poll.lynt_id, { options, total_votes: totalVotes });
	} catch (broadcastError) {
		console.error('Poll vote broadcast error (non-fatal):', broadcastError);
	}

	return json({ success: true });
};
