import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { polls, pollOptions, pollVotes, lynts } from '@/server/schema';
import { eq, and, sql } from 'drizzle-orm';
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

	const { poll_id } = await request.json() as { poll_id: string };
	if (!poll_id) return json({ error: 'Missing poll_id' }, { status: 400 });

	// Verify caller is the lynt author
	const [poll] = await db
		.select({ id: polls.id, lynt_id: polls.lynt_id, resolved_at: polls.resolved_at })
		.from(polls)
		.where(eq(polls.id, poll_id))
		.limit(1);

	if (!poll) return json({ error: 'Poll not found' }, { status: 404 });
	if (poll.resolved_at) return json({ error: 'Already resolved' }, { status: 409 });

	const [lynt] = await db
		.select({ user_id: lynts.user_id })
		.from(lynts)
		.where(eq(lynts.id, poll.lynt_id))
		.limit(1);

	if (!lynt || lynt.user_id !== userId) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	await db.update(polls).set({ resolved_at: new Date() }).where(eq(polls.id, poll_id));

	// Return final tally so the client can immediately render the results
	const tally = await db
		.select({
			option_id: pollOptions.id,
			text: pollOptions.text,
			position: pollOptions.position,
			votes: sql<number>`COUNT(${pollVotes.id})`.as('votes')
		})
		.from(pollOptions)
		.leftJoin(pollVotes, eq(pollVotes.option_id, pollOptions.id))
		.where(eq(pollOptions.poll_id, poll_id))
		.groupBy(pollOptions.id)
		.orderBy(pollOptions.position);

	// Resolving had no live path either — other viewers wouldn't see the
	// poll flip to its final "Ended" state until they refreshed.
	try {
		broadcastPollUpdate(poll.lynt_id, {
			options: tally.map((t) => ({ id: t.option_id, votes: Number(t.votes) })),
			total_votes: tally.reduce((s, t) => s + Number(t.votes), 0),
			resolved_at: new Date().toISOString()
		});
	} catch (broadcastError) {
		console.error('Poll resolve broadcast error (non-fatal):', broadcastError);
	}

	return json({ resolved: true, tally });
};
