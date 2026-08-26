import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { scrollables } from '@/server/schema';
import { scrollablesMinioClient, SCROLLABLES_BUCKET } from '@/server/scrollablesMinio';
import { Snowflake } from 'nodejs-snowflake';
import { sensitiveRatelimit } from '@/server/ratelimit';
import {
	scrollableFeed,
	MAX_SCROLLABLE_DURATION_SECONDS,
	MAX_SCROLLABLE_FILE_SIZE_BYTES
} from '@/server/scrollables';
import { broadcastNewScrollable } from '$lib/ws';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';

const uid = new Snowflake();

// GET /api/scrollables?before=<iso>&minIq=<n>
// Newest-first feed. No auth required — this is also what powers the
// public landing page's third column (see +page.server.ts), so it must
// work for a null viewer.
export const GET: RequestHandler = async ({ url, cookies }) => {
	const userId = await requireUser(cookies);
	const before = url.searchParams.get('before');
	const minIqParam = url.searchParams.get('minIq');
	const minIq = minIqParam ? parseInt(minIqParam, 10) : null;

	const feed = await scrollableFeed(userId, before, Number.isFinite(minIq) ? minIq : null);
	return json({ scrollables: feed });
};

// POST /api/scrollables — multipart/form-data: video (File), caption (string),
// durationSeconds (string), thumbnail (File, optional — client-captured
// poster frame from a <canvas>).
//
// No server-side transcoding here: the file is stored as-is. Duration and
// size are both re-validated server-side (never trust the client number),
// but there's no re-encode/compression pass — that's real infrastructure
// (a transcode queue, HLS packaging, etc.) that's out of scope to bolt on
// in-line in a request handler. Worth revisiting before this ships wide.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Missing authentication' }, { status: 401 });

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) return json({ error: 'You are being ratelimited.' }, { status: 429 });

	const form = await request.formData();
	const video = form.get('video');
	const caption = String(form.get('caption') ?? '').slice(0, 300);
	const durationSeconds = parseInt(String(form.get('durationSeconds') ?? '0'), 10);
	const thumbnail = form.get('thumbnail');

	if (!(video instanceof File)) {
		return json({ error: 'Missing video file' }, { status: 400 });
	}
	if (video.size > MAX_SCROLLABLE_FILE_SIZE_BYTES) {
		return json({ error: `Video must be under ${MAX_SCROLLABLE_FILE_SIZE_BYTES / (1024 * 1024)}MB` }, { status: 400 });
	}
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		return json({ error: 'Missing or invalid durationSeconds' }, { status: 400 });
	}
	if (durationSeconds > MAX_SCROLLABLE_DURATION_SECONDS) {
		return json({ error: `Scrollables can be at most ${MAX_SCROLLABLE_DURATION_SECONDS / 60} minutes` }, { status: 400 });
	}
	if (!video.type.startsWith('video/')) {
		return json({ error: 'File must be a video' }, { status: 400 });
	}

	const id = uid.getUniqueID().toString();
	const videoKey = `scrollable_${id}`;
	const videoBuffer = Buffer.from(await video.arrayBuffer());

	await scrollablesMinioClient.putObject(
		SCROLLABLES_BUCKET,
		`${videoKey}.mp4`,
		videoBuffer,
		videoBuffer.length,
		{ 'Content-Type': video.type }
	);

	let thumbnailKey: string | null = null;
	if (thumbnail instanceof File && thumbnail.size > 0) {
		thumbnailKey = `scrollable_${id}_thumb`;
		const thumbBuffer = Buffer.from(await thumbnail.arrayBuffer());
		await scrollablesMinioClient.putObject(
			SCROLLABLES_BUCKET,
			`${thumbnailKey}.webp`,
			thumbBuffer,
			thumbBuffer.length,
			{ 'Content-Type': 'image/webp' }
		);
	}

	const [row] = await db
		.insert(scrollables)
		.values({
			id,
			user_id: userId,
			caption,
			video_key: videoKey,
			thumbnail_key: thumbnailKey,
			duration_seconds: durationSeconds,
			file_size_bytes: video.size,
		})
		.returning();

	const [author] = await db
		.select({ username: users.username, handle: users.handle, verified: users.verified, nameColor: users.name_color })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	broadcastNewScrollable(
		{ ...row, userId, ...author, likeCount: 0, commentCount: 0, bookmarkCount: 0, liked: false, bookmarked: false },
		userId
	);

	return json({ scrollable: row });
};
