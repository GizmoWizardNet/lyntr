/**
 * src/lib/ws.ts  –  Server-side WebSocket hub
 *
 * Drop-in replacement for the old SSE connection map in src/lib/sse.ts.
 * Exported function names are identical (addConnection/removeConnection/
 * sendToUser/broadcastNewLynt/getOnlineUserIds) so every existing route
 * handler that imports from '$lib/sse' keeps working untouched — see the
 * compatibility shim at the bottom of this file and in sse.ts.
 *
 * New capabilities this version adds, all additive (nothing removed):
 *   - typing indicators        (typing_start / typing_stop)
 *   - live like counters       (like_update broadcast to everyone, not just self)
 *   - viewer-count per open lynt (viewer_join / viewer_leave / viewer_count)
 *   - heartbeat-based dead-connection reaping (ping/pong, no more setInterval keepalive hack)
 */

import type { WebSocket, WebSocketServer } from 'ws';

// ── connection bookkeeping ───────────────────────────────────────────────────
interface Conn {
	ws: WebSocket;
	userId: string;          // 'anonymous' if unauthenticated
	isAlive: boolean;
	watchingLyntId: string | null;  // which open-lynt panel (if any) this tab is viewing
}

const connections = new Set<Conn>();
const byUser = new Map<string, Set<Conn>>();

// userId -> Set of lynt IDs they're currently typing a reply to
const typingState = new Map<string, Set<string>>();

// DM typing: conversationId -> Set<userId>
const dmTypingState = new Map<string, Set<string>>();

export function sendDmTyping(conversationId: string, typingUserId: string, typing: boolean, otherUserIds: string | string[]) {
	const recipients = Array.isArray(otherUserIds) ? otherUserIds : [otherUserIds];
	for (const uid of recipients) {
		broadcastToUser(uid, {
			type: typing ? 'dm_typing_start' : 'dm_typing_stop',
			conversationId,
			userId: typingUserId
		});
	}
	if (typing) {
		if (!dmTypingState.has(conversationId)) dmTypingState.set(conversationId, new Set());
		dmTypingState.get(conversationId)!.add(typingUserId);
	} else {
		dmTypingState.get(conversationId)?.delete(typingUserId);
	}
}

export function sendDmMessage(toUserId: string, message: object) {
	broadcastToUser(toUserId, { type: 'dm_message', ...message });
}

export function sendDmEvent(toUserId: string, event: object) {
	broadcastToUser(toUserId, event);
}

// Fan a DM-related event out to every member of a conversation except
// (optionally) the acting user, who typically already applied the change
// optimistically on their own client. Used for group DMs (>2 members) as
// well as 1:1s, so callers don't need to special-case group size.
export function broadcastDmToMembers(memberUserIds: string[], event: object, excludeUserId?: string) {
	for (const uid of memberUserIds) {
		if (uid === excludeUserId) continue;
		broadcastToUser(uid, event);
	}
}

export const onlineUserIds = new Set<string>();

// ── outbound helpers ──────────────────────────────────────────────────────────
function send(conn: Conn, payload: object) {
	if (conn.ws.readyState === conn.ws.OPEN) {
		try {
			conn.ws.send(JSON.stringify(payload));
		} catch {
			/* socket died mid-send, heartbeat reaper will clean it up */
		}
	}
}

function broadcastAll(payload: object) {
	for (const conn of connections) send(conn, payload);
}

function broadcastToUser(userId: string, payload: object) {
	const conns = byUser.get(userId);
	if (!conns) return;
	for (const conn of conns) send(conn, payload);
}

function broadcastPresence(userId: string, online: boolean) {
	broadcastAll({ type: 'presence_update', userId, online });
}

// ── viewer counts per open lynt ────────────────────────────────────────────────
// Tracks how many tabs currently have a given lynt's detail panel open, so the
// UI can show "3 people viewing" the way live docs do.
const viewersByLynt = new Map<string, Set<Conn>>();

function viewerCountFor(lyntId: string): number {
	return viewersByLynt.get(lyntId)?.size ?? 0;
}

function broadcastViewerCount(lyntId: string) {
	broadcastAll({ type: 'viewer_count', lyntId, count: viewerCountFor(lyntId) });
}

function setWatching(conn: Conn, lyntId: string | null) {
	// Leave previous room
	if (conn.watchingLyntId) {
		const set = viewersByLynt.get(conn.watchingLyntId);
		set?.delete(conn);
		if (set && set.size === 0) viewersByLynt.delete(conn.watchingLyntId);
		else if (set) broadcastViewerCount(conn.watchingLyntId);
	}
	conn.watchingLyntId = lyntId;
	// Join new room
	if (lyntId) {
		if (!viewersByLynt.has(lyntId)) viewersByLynt.set(lyntId, new Set());
		viewersByLynt.get(lyntId)!.add(conn);
		broadcastViewerCount(lyntId);
	}
}

// ── typing indicators ─────────────────────────────────────────────────────────
function setTyping(userId: string, lyntId: string, typing: boolean) {
	if (userId === 'anonymous') return;
	if (!typingState.has(lyntId)) typingState.set(lyntId, new Set());
	const set = typingState.get(lyntId)!;
	const changed = typing ? !set.has(userId) : set.has(userId);
	if (typing) set.add(userId);
	else set.delete(userId);
	if (set.size === 0) typingState.delete(lyntId);

	if (changed) {
		broadcastAll({
			type: typing ? 'typing_start' : 'typing_stop',
			userId,
			lyntId
		});
	}
}

// ── connection lifecycle ───────────────────────────────────────────────────────
function registerConnection(conn: Conn) {
	connections.add(conn);
	if (!byUser.has(conn.userId)) byUser.set(conn.userId, new Set());
	byUser.get(conn.userId)!.add(conn);

	if (conn.userId !== 'anonymous' && byUser.get(conn.userId)!.size === 1) {
		onlineUserIds.add(conn.userId);
		broadcastPresence(conn.userId, true);
	}
}

function unregisterConnection(conn: Conn) {
	connections.delete(conn);

	// Leave any viewer room they were in
	setWatching(conn, null);

	// Clear any typing indicators left dangling.
	// Snapshot entries first since setTyping() mutates typingState as it runs,
	// and mutating a Map while iterating it directly can skip entries.
	for (const [lyntId, typers] of Array.from(typingState.entries())) {
		if (typers.has(conn.userId)) setTyping(conn.userId, lyntId, false);
	}

	const userConns = byUser.get(conn.userId);
	if (userConns) {
		userConns.delete(conn);
		if (userConns.size === 0) {
			byUser.delete(conn.userId);
			if (conn.userId !== 'anonymous') {
				onlineUserIds.delete(conn.userId);
				broadcastPresence(conn.userId, false);
			}
		}
	}
}

// ── public API (mirrors old sse.ts signatures) ───────────────────────────────

export function getOnlineUserIds(): string[] {
	return Array.from(onlineUserIds);
}

export function sendToUser(userId: string, event: { type: string; [key: string]: any }) {
	broadcastToUser(userId, event);
}

export function broadcastNewLynt(lyntId: string) {
	broadcastAll({ type: 'new_lynt', lyntId });
}

// Backwards-compat shim used by a couple of older call sites.
export function sendMessage(lyntId: string) {
	broadcastNewLynt(lyntId);
}

// New: broadcast a like count change to EVERYONE watching the feed, not just
// the liker. Pass `actingUserId` + `liked` so that user's own tabs can update
// their optimistic-UI `likedByUser` flag; other users only get the count.
export function broadcastLikeUpdate(lyntId: string, likeCount: number, actingUserId?: string, liked?: boolean) {
	broadcastAll({ type: 'like_update', lyntId, likeCount });
	if (actingUserId && liked !== undefined) {
		broadcastToUser(actingUserId, { type: 'like_update', lyntId, likeCount, liked });
	}
}

// Repost counts had no live path at all — reposting bumped the DB
// (repostCount is a live computed subquery) but nobody watching the
// original lynt, including the person who just reposted it, saw the
// number change without a manual refresh. Same shape as broadcastLikeUpdate:
// count goes to everyone, the acting user additionally gets `reposted: true`
// so their own repost-button state flips without waiting on a refetch.
export function broadcastRepostUpdate(lyntId: string, repostCount: number, actingUserId?: string) {
	broadcastAll({ type: 'repost_update', lyntId, repostCount });
	if (actingUserId) {
		broadcastToUser(actingUserId, { type: 'repost_update', lyntId, repostCount, reposted: true });
	}
}

// Same shape as broadcastRepostUpdate, for when a parent's commentCount
// needs to move — currently only used when a reply gets deleted (see
// deleteLynt), since new comments already push their own `new_comment`
// event with a full row that MainPage uses to bump the count itself.
export function broadcastCommentCountUpdate(lyntId: string, commentCount: number) {
	broadcastAll({ type: 'comment_count_update', lyntId, commentCount });
}

// A lynt (or a reply/repost of it, cascade-deleted along with it) is gone.
// Before this, deletion only ever removed things for the person who
// clicked delete — everyone else's feed, open thread, or comment list
// still showed it until they manually refreshed and got a 404 clicking in.
export function broadcastLyntDeleted(lyntId: string) {
	broadcastAll({ type: 'lynt_deleted', lyntId });
}

// A reply landed on `lyntId`. Before this, the only people who ever heard
// about a new comment were the parent's author and the person who wrote the
// comment (both via sendToUser from the comment route) — anyone else who
// had that thread's detail panel open (i.e. is in the watch_lynt room for
// this lyntId) never saw it appear without a manual refresh, even though
// the viewer-room infra already exists for exactly this. This reaches
// everyone in that room; the two participant-specific sendToUser calls in
// the comment route stay as-is (they also cover the case where neither of
// them currently has the panel open, e.g. a push-style "someone replied").
export function broadcastNewCommentToViewers(lyntId: string, comment: object) {
	const room = viewersByLynt.get(lyntId);
	if (!room) return;
	const payload = { type: 'new_comment', lyntId, comment };
	for (const conn of room) send(conn, payload);
}

// A lynt's content changed. Nobody watching it live saw an edit take effect
// before this — the edited_at timestamp and new content only reached a
// viewer on their next full refetch. Goes to the same watch_lynt room as
// new comments/viewer counts; also broadcast to everyone (feed cards for
// this lynt need the same patch) the way like/repost updates do.
export function broadcastLyntEdited(
	lyntId: string,
	payload: { content: string; hasLink: boolean; editedAt: string }
) {
	broadcastAll({ type: 'lynt_edited', lyntId, ...payload });
}

// Someone reacted (or un-reacted) to a lynt. Sent per-connection (not one
// shared broadcastAll payload) because `reactedByUser` is viewer-relative —
// exactly like reactedByUser/likedByUser computed in lyntObj() for the
// initial page load. Broadcasting one shared shape with `userIds` instead
// and asking the client to derive its own reactedByUser from it was the
// original approach here, but it doesn't match the `{ emoji, count,
// reactedByUser }` shape ReactionBar already expects from the initial
// fetch — that mismatch is why reactions rendered fine on load but never
// updated live. Recomputing reactedByUser server-side per recipient keeps
// one consistent shape everywhere.
export function broadcastReactionUpdate(
	lyntId: string,
	reactions: { emoji: string; count: number; userIds: string[] }[]
) {
	for (const conn of connections) {
		const viewerId = conn.userId;
		const payload = {
			type: 'reaction_update',
			lyntId,
			reactions: reactions.map((r) => ({
				emoji: r.emoji,
				count: r.count,
				reactedByUser: !!viewerId && r.userIds.includes(viewerId)
			}))
		};
		send(conn, payload);
	}
}

// Poll votes/resolves had no live path at all — a viewer watching a poll
// only ever saw someone else's vote (or the author resolving it) after a
// manual refresh. `payload` carries just the tally shape PollDisplay needs
// to patch in place: per-option vote counts, total_votes, and — for a
// resolve — resolved_at. Deliberately does NOT include who voted for what;
// that's per-viewer state (my_votes) and stays local to each client.
export function broadcastPollUpdate(
	lyntId: string,
	payload: { options: { id: string; votes: number }[]; total_votes: number; resolved_at?: string }
) {
	broadcastAll({ type: 'poll_update', lyntId, ...payload });
}

// ── Scrollables live events ──────────────────────────────────────────────
// Same "server broadcast is truth, acting user's own tabs additionally get
// their personal liked/bookmarked flag" pattern as broadcastLikeUpdate above.
// Scrollables have no per-item "room" (no watch_lynt equivalent) since the
// feed is a single vertical reel — everyone connected just gets these, same
// as new_lynt/presence_update.

// excludeUserId: the uploader's own tab already inserts the new scrollable
// locally the instant the upload finishes (no reason to wait a round-trip
// through the socket for your own post), so it's left out of the broadcast
// to avoid a duplicate card at the top of their own feed.
export function broadcastNewScrollable(scrollable: { userId?: string; [key: string]: unknown }, excludeUserId?: string) {
	const payload = { type: 'new_scrollable', scrollable };
	for (const conn of connections) {
		if (excludeUserId && conn.userId === excludeUserId) continue;
		send(conn, payload);
	}
}

export function broadcastScrollableLikeUpdate(
	scrollableId: string,
	likeCount: number,
	actingUserId?: string,
	liked?: boolean
) {
	broadcastAll({ type: 'scrollable_like_update', scrollableId, likeCount });
	if (actingUserId && liked !== undefined) {
		broadcastToUser(actingUserId, { type: 'scrollable_like_update', scrollableId, likeCount, liked });
	}
}

// Bookmarks are per-viewer state with no public count shown anywhere in the
// UI, so unlike likes this only needs to reach the acting user's OTHER open
// tabs (e.g. bookmarking on desktop should reflect on mobile), not everyone.
export function broadcastScrollableBookmarkUpdate(userId: string, scrollableId: string, bookmarked: boolean) {
	broadcastToUser(userId, { type: 'scrollable_bookmark_update', scrollableId, bookmarked });
}

export function broadcastNewScrollableComment(scrollableId: string, comment: object, commentCount: number) {
	broadcastAll({ type: 'new_scrollable_comment', scrollableId, comment, commentCount });
}

export function broadcastScrollableDeleted(scrollableId: string) {
	broadcastAll({ type: 'scrollable_deleted', scrollableId });
}

// ── main entry point, called once from server.ts ────────────────────────────
//
// `verifyAuthJWT` is passed in (rather than imported via the `@/` alias)
// because this module is loaded by tsx outside of SvelteKit's Vite pipeline,
// where the `@/*` alias does not resolve. server.ts imports the real
// verifyAuthJWT from src/lib/server/jwt.ts and passes it through.
export function attachWebSocketServer(
	wss: WebSocketServer,
	verifyAuthJWT: (token: string) => Promise<{ userId: string }>
) {
	wss.on('connection', async (ws: WebSocket, req) => {
		// ── auth: same JWT cookie used everywhere else in the app ───────────
		let userId = 'anonymous';
		try {
			const cookieHeader = req.headers.cookie ?? '';
			const match = cookieHeader.match(/_TOKEN__DO_NOT_SHARE=([^;]+)/);
			if (match) {
				const payload = await verifyAuthJWT(decodeURIComponent(match[1]));
				if (payload.userId) userId = payload.userId;
			}
		} catch {
			// unauthenticated — still gets broadcast events, just not personal ones
		}

		const conn: Conn = { ws, userId, isAlive: true, watchingLyntId: null };
		registerConnection(conn);

		// Hydrate the new connection immediately, same as the old SSE presence_init.
		send(conn, { type: 'presence_init', onlineUserIds: getOnlineUserIds() });

		ws.on('pong', () => {
			conn.isAlive = true;
		});

		ws.on('message', (raw) => {
			let data: any;
			try {
				data = JSON.parse(raw.toString());
			} catch {
				return;
			}

			switch (data.type) {
				case 'watch_lynt':
					// Client opened a lynt's detail panel — join the viewer room.
					setWatching(conn, typeof data.lyntId === 'string' ? data.lyntId : null);
					break;

				case 'unwatch_lynt':
					setWatching(conn, null);
					break;

				case 'typing_start':
					if (typeof data.lyntId === 'string') setTyping(conn.userId, data.lyntId, true);
					break;

				case 'typing_stop':
					if (typeof data.lyntId === 'string') setTyping(conn.userId, data.lyntId, false);
					break;

				case 'dm_typing_start':
				case 'dm_typing_stop': {
					// The client sends the other member id(s) so we can forward
					// directly without a DB lookup. `otherUserIds` (array) is
					// preferred for group DMs; `otherUserId` (string) still works
					// for 1:1s.
					const recipients = Array.isArray(data.otherUserIds)
						? data.otherUserIds.filter((id: unknown) => typeof id === 'string')
						: typeof data.otherUserId === 'string' ? [data.otherUserId] : [];
					if (typeof data.conversationId === 'string' && recipients.length > 0) {
						const dmTyping = data.type === 'dm_typing_start';
						sendDmTyping(data.conversationId, conn.userId, dmTyping, recipients);
					}
					break;
				}

				// Lightweight client-initiated ping for environments where
				// the browser doesn't expose native ws ping/pong easily.
				case 'ping':
					send(conn, { type: 'pong' });
					break;
			}
		});

		ws.on('close', () => unregisterConnection(conn));
		ws.on('error', () => unregisterConnection(conn));
	});

	// ── heartbeat: reap dead connections every 30s ────────────────────────────
	// Replaces the old per-connection setInterval keep-alive comment hack.
	const heartbeat = setInterval(() => {
		for (const conn of connections) {
			if (!conn.isAlive) {
				conn.ws.terminate();
				unregisterConnection(conn);
				continue;
			}
			conn.isAlive = false;
			try {
				conn.ws.ping();
			} catch {
				unregisterConnection(conn);
			}
		}
	}, 30000);

	wss.on('close', () => clearInterval(heartbeat));
}