import { db } from '@/server/db';
import { lynts, likes, followers, users, notifications, history, polls, pollOptions, pollVotes, lyntImages, lyntContributors, bookmarks, lyntReactions } from '@/server/schema';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { isImageNsfw } from '@/moderation';
import { broadcastLyntDeleted, broadcastRepostUpdate, broadcastCommentCountUpdate } from '@/sse';

// Hard cap on images per lynt/comment — keeps the composer's drag-and-drop
// grid and the rendered gallery both predictable (2x2 max grid).
export const MAX_LYNT_IMAGES = 4;

// ---------------------------------------------------------------------------
// lyntObj
// ---------------------------------------------------------------------------
// Builds the column-selection payload used by every feed query.
//
// BEFORE: 9 correlated subqueries fired per lynt for parent data alone,
//         plus more for counts, social state, etc.
//
// AFTER:  Parent lynt + parent user data resolved via a single lateral
//         subquery that returns one JSON object.  All counts still use
//         correlated subqueries (unavoidable without materialised views)
//         but are now consolidated and clearly commented.
//         Call sites are unchanged – the return type is identical.
// ---------------------------------------------------------------------------

export const lyntObj = (userId: string | null) => {
	// ── social-state helpers ───────────────────────────────────────────────
	// These must stay as correlated subqueries because they are viewer-
	// dependent and therefore cannot be pre-joined at the FROM level.

	const likedByUser = userId
		? sql<boolean>`exists(
			select 1 from ${likes}
			where ${likes.lynt_id} = ${lynts.id}
			  and ${likes.user_id} = ${userId}
		)`.as('liked_by_user')
		: sql<boolean>`false`.as('liked_by_user');

	const repostedByUser = userId
		? sql<boolean>`exists(
			select 1 from ${lynts} as reposts
			where reposts.parent  = ${lynts.id}
			  and reposts.reposted = true
			  and reposts.user_id  = ${userId}
		)`.as('reposted_by_user')
		: sql<boolean>`false`.as('reposted_by_user');

	const likedByFollowed = userId
		? sql<boolean>`exists(
			select 1 from ${followers}
			where ${followers.user_id}    = ${userId}
			  and ${followers.follower_id} = ${lynts.user_id}
		)`.as('liked_by_followed')
		: sql<boolean>`false`.as('liked_by_followed');

	const followsViewer = userId
		? sql<boolean>`exists(
			select 1 from ${followers}
			where ${followers.follower_id} = ${lynts.user_id}
			  and ${followers.user_id}     = ${userId}
		)`.as('follows_viewer')
		: sql<boolean>`false`.as('follows_viewer');

	// ── aggregate counts ───────────────────────────────────────────────────
	// Kept as correlated subqueries.  The new indexes on history(lynt_id),
	// likes(lynt_id via PK), and lynts(parent) make these fast.

	const viewCount = sql<number>`(
		select count(*)
		from   ${history}
		where  ${history.lynt_id} = ${lynts.id}
	)`.as('views');

	const likeCount = sql<number>`(
		select count(*)
		from   ${likes}
		where  ${likes.lynt_id} = ${lynts.id}
	)`.as('likeCount');

	const repostCount = sql<number>`(
		select count(*)
		from   ${lynts} as reposts
		where  reposts.parent   = ${lynts.id}
		  and  reposts.reposted = true
	)`.as('repost_count');

	const commentCount = sql<number>`(
		select count(*)
		from   ${lynts} as comments
		where  comments.parent   = ${lynts.id}
		  and  comments.reposted = false
	)`.as('comment_count');

	const followerCount = sql<number>`(
		select count(*)
		from   ${followers}
		where  user_id = ${users.id}
	)`.as('follower_count');

	const imagesJson = sql<any>`(
		select coalesce(json_agg(
			json_build_object('key', li.image_key, 'position', li.position)
			order by li.position
		), '[]'::json)
		from ${lyntImages} li
		where li.lynt_id = ${lynts.id}
	)`.as('images');

	// ── parent data (the big win) ──────────────────────────────────────────
	// Previously: 9 separate correlated subqueries, each doing its own
	//   SELECT … FROM lynts WHERE id = parent joined to a users lookup.
	//
	// Now: one lateral subquery that returns all parent fields as a single
	//   JSON object.  Postgres resolves the parent row once per lynt and
	//   the outer query extracts individual fields with ->>.
	//
	// The JSON approach lets us keep the same flat column names in the
	// result so all callers (Lynt.svelte, feeds, etc.) need zero changes.

	const parentJson = sql<string>`(
		select row_to_json(p)
		from (
			select
				pl.id,
				pl.content,
				pl.has_image,
				pl.gif_url,
				pl.gif_preview_url,
				pl.created_at,
				pu.id        as user_id,
				pu.handle,
				pu.username,
				pu.bio,
				pu.verified,
				pu.iq,
				pu.name_color,
				pu.created_at as user_created_at,
				(
					select coalesce(json_agg(
						json_build_object('key', pli.image_key, 'position', pli.position)
						order by pli.position
					), '[]'::json)
					from ${lyntImages} pli
					where pli.lynt_id = pl.id
				) as images
			from   ${lynts} as pl
			join   ${users} as pu on pu.id = pl.user_id
			where  pl.id = ${lynts.parent}
			limit  1
		) p
	)`;

	// Individual columns extracted from the JSON blob.
	// These keep the exact same aliases as the old correlated subqueries so
	// no call site needs changing.
	const parentContent       = sql<string | null>`(${parentJson}->>'content')`.as('parent_content');
	const parentHasImage      = sql<boolean | null>`((${parentJson}->>'has_image')::boolean)`.as('has_image');
	const parentGifUrl        = sql<string | null>`(${parentJson}->>'gif_url')`.as('parent_gif_url');
	const parentGifPreviewUrl = sql<string | null>`(${parentJson}->>'gif_preview_url')`.as('parent_gif_preview_url');
	const parentUserHandle    = sql<string | null>`(${parentJson}->>'handle')`.as('parent_user_handle');
	const parentUserCreatedAt = sql<string | null>`(${parentJson}->>'user_created_at')`.as('parent_user_created_at');
	const parentUserBio       = sql<string | null>`(${parentJson}->>'bio')`.as('bio');
	const parentUserUsername  = sql<string | null>`(${parentJson}->>'username')`.as('parent_user_username');
	const parentUserVerified  = sql<boolean | null>`((${parentJson}->>'verified')::boolean)`.as('parent_user_verified');
	const parentUserIq        = sql<number | null>`((${parentJson}->>'iq')::int)`.as('parent_user_iq');
	const parentUserId        = sql<string | null>`(${parentJson}->>'user_id')`.as('parent_user_id');
	const parentCreatedAt     = sql<string | null>`(${parentJson}->>'created_at')`.as('parent_created_at');
	const parentUserNameColor = sql<string | null>`(${parentJson}->>'name_color')`.as('parent_user_name_color');
	const parentImages        = sql<any>`(${parentJson}->'images')`.as('parent_images');

	// ── poll data (single lateral subquery, same technique as parentJson) ───
	// Previously: polls were fetched with fetchPollForLynt(), a *separate*
	// async function doing 3 more sequential round-trips, and it was only
	// ever called from the single-lynt GET handler — never from any feed
	// query. That's why polls silently never rendered in feeds, and why
	// opening a lynt with a poll was slow (main select → views UPDATE →
	// referenced lynts → poll row → poll options → my votes, all serial).
	//
	// Now: Postgres resolves this correlated subquery once per row as part
	// of the exact same SELECT every feed/lynt query already runs. Zero
	// extra round-trips, and it "just works" everywhere lyntObj is used,
	// since every call site spreads {...lyntObj(userId)} and every Lynt
	// list in the UI renders with <Lynt {...lynt} .../>.
	//
	// `voted` per option isn't computed in SQL here (would mean evaluating
	// the vote-filter subquery again per option); callers should run the
	// result through hydratePoll() below, which fills it in from `my_votes`
	// in plain JS after the query returns.
	const pollUserVotesFilter = userId
		? sql`pv.user_id = ${userId}`
		: sql`false`;

	const pollJson = sql<any>`(
		select row_to_json(pj) from (
			select
				p.id,
				p.title,
				p.multi_select,
				p.resolve_at,
				p.resolved_at,
				(
					select coalesce(json_agg(
						json_build_object(
							'id',       po.id,
							'text',     po.text,
							'position', po.position,
							'votes',    (select count(*)::int from ${pollVotes} pv2 where pv2.option_id = po.id)
						) order by po.position
					), '[]'::json)
					from ${pollOptions} po
					where po.poll_id = p.id
				) as options,
				(
					select coalesce(json_agg(pv.option_id), '[]'::json)
					from ${pollVotes} pv
					where pv.poll_id = p.id and ${pollUserVotesFilter}
				) as my_votes,
				(
					select count(*)::int from ${pollVotes} pv3 where pv3.poll_id = p.id
				) as total_votes
			from ${polls} p
			where p.lynt_id = ${lynts.id}
			limit 1
		) pj
	)`.as('poll');

	// ── clan lynt contributors (single lateral subquery, same technique) ────
	// Ordered array of every contributor for a clan lynt — empty for a
	// normal solo lynt. Drives the group-avatar stack and "no individual
	// IQ" average badge in the UI without any extra round-trip.
	const contributorsJson = sql<any>`(
		select coalesce(json_agg(
			json_build_object(
				'userId',   lc.user_id,
				'username', cu.username,
				'handle',   cu.handle
			) order by lc.position
		), '[]'::json)
		from ${lyntContributors} lc
		join ${users} cu on cu.id = lc.user_id
		where lc.lynt_id = ${lynts.id}
	)`.as('contributors');

	// ── reactions (single lateral subquery, same technique as contributors) ─
	// One row per distinct emoji with its count, plus whether *this* viewer
	// is one of the reactors — mirrors likedByUser's viewer-dependent shape
	// so ReactionBar can render active/inactive state without a second
	// query. Kept out of likeCount/likedByUser entirely — see the schema
	// comment on lynt_reactions for why reactions are a separate layer.
	const reactionsJson = sql<any>`(
		select coalesce(json_agg(
			json_build_object(
				'emoji', r.emoji,
				'count', r.cnt,
				'reactedByUser', ${userId ? sql`r.reacted_by_user` : sql`false`}
			) order by r.cnt desc
		), '[]'::json)
		from (
			select
				lr.emoji,
				count(*)::int as cnt
				${userId ? sql`, bool_or(lr.user_id = ${userId}) as reacted_by_user` : sql``}
			from ${lyntReactions} lr
			where lr.lynt_id = ${lynts.id}
			group by lr.emoji
		) r
	)`.as('reactions');

	return {
		// ── lynt core ─────────────────────────────────────────────────────
		id:           lynts.id,
		reactions:    reactionsJson,
		content:      lynts.content,
		userId:       lynts.user_id,
		createdAt:    lynts.created_at,
		editedAt:     lynts.edited_at,
		reposted:     lynts.reposted,
		parentId:     lynts.parent,
		has_image:    lynts.has_image,
		images:       imagesJson,
		gif_url:      lynts.gif_url,
		gif_preview_url: lynts.gif_preview_url,
		isClan:       lynts.is_clan,
		clanAvgIq:    lynts.clan_avg_iq,
		contributors: contributorsJson,

		// ── counts ────────────────────────────────────────────────────────
		views:        viewCount,
		likeCount,
		repostCount,
		commentCount,

		// ── viewer social state ───────────────────────────────────────────
		likedByUser,
		repostedByUser,
		likedByFollowed,

		// ── author info (comes from the LEFT JOIN users in every feed) ────
		handle:          users.handle,
		bio:             users.bio,
		userCreatedAt:   users.created_at,
		username:        users.username,
		iq:              users.iq,
		verified:        users.verified,
		isAdmin:         users.is_admin,
		contributor:     users.contributor,
		loginStreak:     users.login_streak,
		followerCount,
		followsViewer,
		nameColor:       users.name_color,

		// ── parent data (single lateral subquery) ─────────────────────────
		// _parent_json is resolved first; the rest are projections of it.
		// Drizzle emits these as regular SELECT expressions — no extra round
		// trips.  Postgres evaluates the lateral subquery once per lynt row.
		_parentJson: parentJson.as('_parent_json'),
		parentContent,
		parentHasImage,
		parentImages,
		parentGifUrl,
		parentGifPreviewUrl,
		parentUserHandle,
		parentUserCreatedAt,
		parentUserBio,
		parentUserUsername,
		parentUserVerified,
		parentUserIq,
		parentUserId,
		parentCreatedAt,
		parentUserNameColor,

		// ── poll (single lateral subquery, null if none exists) ───────────
		poll: pollJson,
	};
};

// ---------------------------------------------------------------------------
// hydratePoll / hydratePolls
// ---------------------------------------------------------------------------
// Fills in each poll option's `voted` flag from `my_votes` in plain JS.
// Run every row returned by a lyntObj() query through this before sending
// it to the client. Cheap — just an array pass over however many options
// the poll has (max 10) — versus another SQL subquery evaluation.
// ---------------------------------------------------------------------------
export function hydratePoll<T extends { poll?: any }>(row: T): T {
	if (row.poll) {
		const myVotes: string[] = row.poll.my_votes ?? [];
		row.poll = {
			...row.poll,
			options: (row.poll.options ?? []).map((o: any) => ({
				...o,
				voted: myVotes.includes(o.id)
			}))
		};
	}
	return row;
}

export function hydratePolls<T extends { poll?: any }>(rows: T[]): T[] {
	return rows.map(hydratePoll);
}

// ---------------------------------------------------------------------------
// processAndUploadLyntImages
// ---------------------------------------------------------------------------
// Shared by the lynt and comment POST endpoints. Runs each file through the
// same NSFW check + webp resize pipeline the old single-image code used,
// then uploads it and returns rows ready to insert into lynt_images.
//
// Image keys: the first image keeps the legacy bare-id key (`${lyntId}`) so
// old CDN URL conventions / caches keep working; subsequent images get
// `${lyntId}_img{position}`.
//
// Throws an Error('NSFW') if any image fails moderation — callers should
// catch this and respond with the existing NSFW_ERROR response, same as
// the old inline check did.
// ---------------------------------------------------------------------------
export async function processAndUploadLyntImages(
	files: File[],
	lyntId: string,
	minioClient: any
): Promise<{ lynt_id: string; image_key: string; position: number }[]> {
	const rows: { lynt_id: string; image_key: string; position: number }[] = [];

	for (let i = 0; i < files.length; i++) {
		const inputBuffer = Buffer.from(await files[i].arrayBuffer());

		if (await isImageNsfw(inputBuffer)) {
			throw new Error('NSFW');
		}

		const resizedBuffer = await sharp(inputBuffer, { animated: true })
			.rotate()
			.webp({ quality: 70 })
			.withMetadata()
			.toBuffer();

		const imageKey = i === 0 ? lyntId : `${lyntId}_img${i}`;

		await minioClient.putObject(
			process.env.S3_BUCKET_NAME!,
			`${imageKey}.webp`,
			resizedBuffer,
			resizedBuffer.length,
			{ 'Content-Type': 'image/webp' }
		);

		rows.push({ lynt_id: lyntId, image_key: imageKey, position: i });
	}

	return rows;
}

// ---------------------------------------------------------------------------
// uploadAvatar  (unchanged)
// ---------------------------------------------------------------------------
// A malicious animated WebP/GIF can carry thousands of frames — sharp will
// happily try to decode/re-encode all of them, which is both a storage
// blow-up (an animated avatar could otherwise balloon past what a static
// one ever could) and a CPU-time DoS vector on this endpoint. Reject
// anything past a sane frame count before doing any resize/encode work.
// 300 frames is generous — at a typical 15–20fps source GIF/WebP that's
// still 15-20 seconds of animation, far more than an avatar/banner needs.
const MAX_ANIMATION_FRAMES = 300;

export async function assertReasonableFrameCount(inputBuffer: Buffer) {
	const metadata = await sharp(inputBuffer).metadata();
	const pages = metadata.pages ?? 1;
	if (pages > MAX_ANIMATION_FRAMES) {
		throw new Error(`Animated image has too many frames (${pages}); max is ${MAX_ANIMATION_FRAMES}`);
	}
}

export async function uploadAvatar(inputBuffer: Buffer, fileName: string, minioClient: any) {
	await assertReasonableFrameCount(inputBuffer);

	// `{ animated: true }` tells sharp to read every frame of an animated
	// source (animated WebP or GIF) instead of just the first — without it,
	// resize()+webp() silently collapses an animated upload down to a single
	// still frame, which is why animated avatars never actually animated.
	// Harmless no-op for ordinary static images (jpg/png/still webp).
	const buffer_small  = await sharp(inputBuffer, { animated: true }).resize(40,  40).webp().toBuffer();
	const buffer_medium = await sharp(inputBuffer, { animated: true }).resize(50,  50).webp().toBuffer();
	const buffer_big    = await sharp(inputBuffer, { animated: true }).resize(160, 160).webp().toBuffer();

	const shits = [
		{ filename: fileName + '_small.webp',  buffer: buffer_small  },
		{ filename: fileName + '_medium.webp', buffer: buffer_medium },
		{ filename: fileName + '_big.webp',    buffer: buffer_big    },
	];

	for (const shit of shits) {
		await minioClient.removeObject(process.env.S3_BUCKET_NAME!, shit.filename);
		await minioClient.putObject(
			process.env.S3_BUCKET_NAME!,
			shit.filename,
			shit.buffer,
			shit.buffer.length,
			{ 'Content-Type': 'image/webp' }
		);
	}
}

// ---------------------------------------------------------------------------
// deleteLynt  (unchanged)
// ---------------------------------------------------------------------------
export async function deleteLynt(lyntId: string) {
	// Gathered *before* the transaction so we know what to tell live viewers
	// about afterwards — the transaction itself cascades these away, and
	// there'd be nothing left to query once it commits.
	const [target] = await db
		.select({ id: lynts.id, parent: lynts.parent, reposted: lynts.reposted })
		.from(lynts)
		.where(eq(lynts.id, lyntId))
		.limit(1);

	const childComments = await db
		.select({ id: lynts.id })
		.from(lynts)
		.where(and(eq(lynts.parent, lyntId), eq(lynts.reposted, false)));

	await db.transaction(async (trx) => {
		const comments   = await trx.select({ id: lynts.id }).from(lynts).where(eq(lynts.parent, lyntId));
		const commentIds = comments.map((c) => c.id);
		const allIds     = [lyntId, ...commentIds];

		await trx.delete(likes).where(inArray(likes.lynt_id, allIds));
		// bookmarks.lynt_id has no onDelete: cascade, so any lynt that's ever
		// been bookmarked — including a published clan lynt, which is what
		// actually flagged this — would hit a foreign key violation on the
		// final `delete(lynts)` below and silently fail the whole delete.
		await trx.delete(bookmarks).where(inArray(bookmarks.lynt_id, allIds));
		await trx.delete(notifications).where(inArray(notifications.lyntId, allIds));
		await trx.delete(history).where(inArray(history.lynt_id, allIds));
		await trx.delete(lynts).where(and(eq(lynts.parent, lyntId), eq(lynts.reposted, false)));
		await trx
			.update(lynts)
			.set({
				content: sql`${lynts.content} || '\nThe Lynt this user is reposting has been since deleted.'`,
				parent:  null
			})
			.where(and(eq(lynts.parent, lyntId), eq(lynts.reposted, true)));
		await trx.delete(lynts).where(eq(lynts.id, lyntId));
	});

	// ── Live removal ──────────────────────────────────────────────────
	// Previously deletion only ever took effect for the person who clicked
	// delete — anyone else's feed, open thread, or comment list kept
	// showing the lynt (and its now-cascaded replies) until they manually
	// refreshed and got a 404 clicking into it. Put here, in deleteLynt
	// itself, so it covers every caller for free: user self-delete, admin
	// delete, ban cascade, and account deletion.
	try {
		broadcastLyntDeleted(lyntId);
		for (const c of childComments) broadcastLyntDeleted(c.id);

		if (target?.parent) {
			if (target.reposted) {
				const [{ count: freshRepostCount }] = await db
					.select({ count: sql<number>`count(*)` })
					.from(lynts)
					.where(sql`${lynts.parent} = ${target.parent} and ${lynts.reposted} = true`);
				broadcastRepostUpdate(target.parent, Number(freshRepostCount));
			} else {
				const [{ count: freshCommentCount }] = await db
					.select({ count: sql<number>`count(*)` })
					.from(lynts)
					.where(sql`${lynts.parent} = ${target.parent} and ${lynts.reposted} = false`);
				broadcastCommentCountUpdate(target.parent, Number(freshCommentCount));
			}
		}
	} catch (broadcastError) {
		console.error('Delete broadcast error (non-fatal):', broadcastError);
	}
}

// ---------------------------------------------------------------------------
// fetchReferencedLynts
// ---------------------------------------------------------------------------
// Previously: one full lyntObj query per parent, fired one at a time in a
// recursive async function — a deep thread chain = N serial DB round-trips.
//
// Now: a single recursive CTE walks the parent chain in one query, then
// one lyntObj SELECT fetches all found IDs at once. Two round-trips total,
// regardless of chain depth.
// ---------------------------------------------------------------------------
export async function fetchReferencedLynts(
	userId: string | null,
	parentId: string | null
): Promise<any[]> {
	if (!parentId) return [];

	// Step 1: walk the parent chain in one recursive CTE.
	const chainRows = await db.execute<{ id: string; parent: string | null; depth: number }>(
		sql`
			WITH RECURSIVE chain AS (
				SELECT id, parent, 0 AS depth
				FROM ${lynts}
				WHERE id = ${parentId}

				UNION ALL

				SELECT l.id, l.parent, c.depth + 1
				FROM ${lynts} l
				JOIN chain c ON l.id = c.parent
				WHERE c.depth < 20
			)
			SELECT id, parent, depth FROM chain ORDER BY depth DESC
		`
	);

	if (chainRows.length === 0) return [];

	// Step 2: fetch all parents in a single lyntObj query, preserving order.
	const ids = chainRows.map((r) => r.id);
	const obj = lyntObj(userId);

	const rows = await db
		.select(obj)
		.from(lynts)
		.leftJoin(users, eq(lynts.user_id, users.id))
		.where(inArray(lynts.id, ids));

	// Re-order to match the chain order (oldest ancestor first).
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids.map((id) => byId.get(id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// fetchPollForLynt — REMOVED
// ---------------------------------------------------------------------------
// This used to be a standalone function doing 3 sequential DB round-trips
// (poll row → options+votes → my votes), called only from the single-lynt
// GET handler. That's why polls never appeared in feeds (nothing else
// called it) and why loading a lynt with a poll was slow.
//
// Poll data is now resolved inside lyntObj()'s own SELECT via `pollJson`
// (see above) — one correlated subquery, zero extra round-trips, and it
// flows through every feed automatically. See hydratePoll()/hydratePolls()
// for filling in each option's `voted` flag after the query returns.
// ---------------------------------------------------------------------------
