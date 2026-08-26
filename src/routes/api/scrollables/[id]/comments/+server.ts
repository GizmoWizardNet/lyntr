import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { normalRatelimit } from '@/server/ratelimit';
import { listScrollableComments, addScrollableComment, getScrollableCommentCount } from '@/server/scrollables';
import { broadcastNewScrollableComment } from '$lib/ws';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const comments = await listScrollableComments(params.id!);
	return json({ comments });
};

// POST { content: string, gifUrl?: string, gifPreviewUrl?: string }
// content can be empty ONLY if a gif is attached (gif-only comment),
// same rule the lynt composer uses for its own gif-only posts.
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const { success } = await normalRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const body = await request.json();
	const content = String(body.content ?? '').trim();
	const gifUrl = body.gifUrl ? String(body.gifUrl) : null;
	const gifPreviewUrl = body.gifPreviewUrl ? String(body.gifPreviewUrl) : null;

	if (!content && !gifUrl) {
		return json({ error: 'Comment cannot be empty' }, { status: 400 });
	}
	if (content.length > 280) {
		return json({ error: 'Comment is too long' }, { status: 400 });
	}

	try {
		const comment = await addScrollableComment(params.id!, userId, content, gifUrl, gifPreviewUrl);
		const [author] = await db
			.select({ username: users.username, handle: users.handle, verified: users.verified, nameColor: users.name_color })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		const commentCount = await getScrollableCommentCount(params.id!);
		// Broadcast to everyone (viewer count on Scrollables is small enough
		// that a per-item "room" isn't worth the complexity new_comment uses
		// for lynts) so anyone with the comment drawer open sees it land live,
		// and everyone's rail count updates without a refresh.
		broadcastNewScrollableComment(params.id!, { ...comment, ...author }, commentCount);
		return json({ comment });
	} catch (e) {
		if (e instanceof Error && e.message === 'NOT_FOUND') return json({ error: 'Not found' }, { status: 404 });
		throw e;
	}
};
