import { db } from '@/server/db';
import {
	scrollables,
	scrollableLikes,
	scrollableBookmarks,
	scrollableComments,
	users
} from '@/server/schema';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

export const MAX_SCROLLABLE_DURATION_SECONDS = 180; // 3 min
export const MAX_SCROLLABLE_FILE_SIZE_BYTES = 300 * 1024 * 1024; // 300MB

// IQ awarded to the AUTHOR of a scrollable when someone else interacts
// with it. Matches the numbers given in the feature spec exactly — do
// not change these without updating the copy in ScrollableCard.svelte's
// tooltips, which state them.
export const IQ_AWARD_LIKE = 3;
export const IQ_AWARD_BOOKMARK = 5;
export const IQ_AWARD_COMMENT = 10;

// Column selection shared by the feed and single-item lookup. Mirrors
// lyntObj's shape in api/util.ts — one JSON-ish flat row per scrollable
// with author fields inlined, plus per-viewer like/bookmark state and
// aggregate counts via correlated scalar subqueries.
function scrollableObj(viewerId: string | null) {
	return {
		id: scrollables.id,
		userId: scrollables.user_id,
		caption: scrollables.caption,
		videoKey: scrollables.video_key,
		thumbnailKey: scrollables.thumbnail_key,
		durationSeconds: scrollables.duration_seconds,
		fileSizeBytes: scrollables.file_size_bytes,
		views: scrollables.views,
		createdAt: scrollables.created_at,
		username: users.username,
		handle: users.handle,
		verified: users.verified,
		isAdmin: users.is_admin,
		contributor: users.contributor,
		nameColor: users.name_color,
		authorIq: users.iq,
		likeCount: sql<number>`(select count(*)::int from ${scrollableLikes} where ${scrollableLikes.scrollable_id} = ${scrollables.id})`,
		bookmarkCount: sql<number>`(select count(*)::int from ${scrollableBookmarks} where ${scrollableBookmarks.scrollable_id} = ${scrollables.id})`,
		commentCount: sql<number>`(select count(*)::int from ${scrollableComments} where ${scrollableComments.scrollable_id} = ${scrollables.id})`,
		liked: viewerId
			? sql<boolean>`exists(select 1 from ${scrollableLikes} where ${scrollableLikes.scrollable_id} = ${scrollables.id} and ${scrollableLikes.user_id} = ${viewerId})`
			: sql<boolean>`false`,
		bookmarked: viewerId
			? sql<boolean>`exists(select 1 from ${scrollableBookmarks} where ${scrollableBookmarks.scrollable_id} = ${scrollables.id} and ${scrollableBookmarks.user_id} = ${viewerId})`
			: sql<boolean>`false`,
	};
}

// Newest-first feed, cursor-paginated on created_at (same pattern as
// api/feed/new.ts). minIq, when set, filters to scrollables whose AUTHOR
// currently has at least that IQ — this is the "filter by IQ level"
// control shared with the lynt feed.
export async function scrollableFeed(viewerId: string | null, before?: string | null, minIq?: number | null) {
	const conditions = [eq(scrollables.user_id, users.id)];
	if (before) conditions.push(lt(scrollables.created_at, new Date(before)));
	if (minIq !== undefined && minIq !== null) conditions.push(gte(users.iq, minIq));

	return db
		.select(scrollableObj(viewerId))
		.from(scrollables)
		.innerJoin(users, eq(scrollables.user_id, users.id))
		.where(and(...conditions))
		.orderBy(desc(scrollables.created_at))
		.limit(10);
}

export async function getScrollable(id: string, viewerId: string | null) {
	const [row] = await db
		.select(scrollableObj(viewerId))
		.from(scrollables)
		.innerJoin(users, eq(scrollables.user_id, users.id))
		.where(eq(scrollables.id, id))
		.limit(1);
	return row ?? null;
}

// Toggle like. Only awards IQ on the like edge (false -> true) — unliking
// never removes IQ, same "awards are one-directional" philosophy as the
// existing LyntCoins system (see lc_transactions comment in schema.ts):
// once earned, it isn't clawed back for a later change of mind.
export async function toggleScrollableLike(scrollableId: string, userId: string) {
	const [existing] = await db
		.select()
		.from(scrollableLikes)
		.where(and(eq(scrollableLikes.scrollable_id, scrollableId), eq(scrollableLikes.user_id, userId)))
		.limit(1);

	if (existing) {
		await db
			.delete(scrollableLikes)
			.where(and(eq(scrollableLikes.scrollable_id, scrollableId), eq(scrollableLikes.user_id, userId)));
		return { liked: false };
	}

	const [scrollable] = await db.select({ userId: scrollables.user_id }).from(scrollables).where(eq(scrollables.id, scrollableId)).limit(1);
	if (!scrollable) throw new Error('NOT_FOUND');

	await db.insert(scrollableLikes).values({ scrollable_id: scrollableId, user_id: userId });

	if (scrollable.userId !== userId) {
		await db.update(users).set({ iq: sql`${users.iq} + ${IQ_AWARD_LIKE}` }).where(eq(users.id, scrollable.userId));
	}

	return { liked: true };
}

export async function getScrollableLikeCount(scrollableId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(scrollableLikes)
		.where(eq(scrollableLikes.scrollable_id, scrollableId));
	return row?.count ?? 0;
}

export async function toggleScrollableBookmark(scrollableId: string, userId: string) {
	const [existing] = await db
		.select()
		.from(scrollableBookmarks)
		.where(and(eq(scrollableBookmarks.scrollable_id, scrollableId), eq(scrollableBookmarks.user_id, userId)))
		.limit(1);

	if (existing) {
		await db
			.delete(scrollableBookmarks)
			.where(and(eq(scrollableBookmarks.scrollable_id, scrollableId), eq(scrollableBookmarks.user_id, userId)));
		return { bookmarked: false };
	}

	const [scrollable] = await db.select({ userId: scrollables.user_id }).from(scrollables).where(eq(scrollables.id, scrollableId)).limit(1);
	if (!scrollable) throw new Error('NOT_FOUND');

	await db.insert(scrollableBookmarks).values({ scrollable_id: scrollableId, user_id: userId });

	if (scrollable.userId !== userId) {
		await db.update(users).set({ iq: sql`${users.iq} + ${IQ_AWARD_BOOKMARK}` }).where(eq(users.id, scrollable.userId));
	}

	return { bookmarked: true };
}

export async function listScrollableComments(scrollableId: string) {
	return db
		.select({
			id: scrollableComments.id,
			content: scrollableComments.content,
			gifUrl: scrollableComments.gif_url,
			gifPreviewUrl: scrollableComments.gif_preview_url,
			createdAt: scrollableComments.created_at,
			userId: scrollableComments.user_id,
			username: users.username,
			handle: users.handle,
			verified: users.verified,
			nameColor: users.name_color,
		})
		.from(scrollableComments)
		.innerJoin(users, eq(scrollableComments.user_id, users.id))
		.where(eq(scrollableComments.scrollable_id, scrollableId))
		.orderBy(desc(scrollableComments.created_at));
}

// Every comment awards IQ, unlike likes/bookmarks which only award once
// per (user, scrollable) pair — a comment is a new row every time, so
// "once per comment" already prevents any repeat-award exploit here.
export async function addScrollableComment(
	scrollableId: string,
	userId: string,
	content: string,
	gifUrl?: string | null,
	gifPreviewUrl?: string | null
) {
	const [scrollable] = await db.select({ userId: scrollables.user_id }).from(scrollables).where(eq(scrollables.id, scrollableId)).limit(1);
	if (!scrollable) throw new Error('NOT_FOUND');

	const [comment] = await db
		.insert(scrollableComments)
		.values({ scrollable_id: scrollableId, user_id: userId, content, gif_url: gifUrl ?? null, gif_preview_url: gifPreviewUrl ?? null })
		.returning();

	if (scrollable.userId !== userId) {
		await db.update(users).set({ iq: sql`${users.iq} + ${IQ_AWARD_COMMENT}` }).where(eq(users.id, scrollable.userId));
	}

	return comment;
}

export async function getScrollableCommentCount(scrollableId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(scrollableComments)
		.where(eq(scrollableComments.scrollable_id, scrollableId));
	return row?.count ?? 0;
}
