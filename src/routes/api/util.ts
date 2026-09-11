import { db } from '@/server/db';
import { lynts, likes, followers, users, notifications, history, polls, pollOptions, pollVotes, lyntImages, lyntContributors, bookmarks, lyntReactions } from '@/server/schema';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { isImageNsfw } from '@/moderation';
import { broadcastLyntDeleted, broadcastRepostUpdate, broadcastCommentCountUpdate } from '@/sse';

// Hard cap on images per lynt/comment — keeps the composer's drag-and-drop
// grid and the rendered gallery both predictable (2x2 max grid).
export const MAX_LYNT_IMAGES = 4;

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
		lyntskinKey:  lynts.lyntskin_key,
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

export async function deleteLynt(lyntId: string) {
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
