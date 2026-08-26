import { readable, writable } from 'svelte/store';
import { PUBLIC_CDN_URL, PUBLIC_SCROLLABLES_CDN_URL, PUBLIC_SCROLLABLES_BUCKET_NAME } from '$env/static/public';

export const currentPage = writable('home');
// Set by Notifications.svelte when a forum-related notification is clicked;
// ForumPage reads (and clears) it to jump straight to that thread.
export const pendingForumThreadId = writable<string | null>(null);
// Set by ParsedContent.svelte when a #hashtag is clicked; Search.svelte
// reads (and clears) it to pre-fill and run that search immediately.
export const pendingSearchQuery = writable<string | null>(null);
export const v = String(Math.random());
export const cdnUrl = (filename: string, dimension: string | null = null) => {
	return `${PUBLIC_CDN_URL}/lyntr/${filename}${dimension ? '_' + dimension : ''}.webp?v=${v}`;
};

// For assets stored under their own already-extensioned key (e.g. an
// uploaded profile song) rather than the image-pipeline convention that
// cdnUrl() assumes (always .webp, optional _dimension suffix).
export const cdnRawUrl = (key: string) => `${PUBLIC_CDN_URL}/lyntr/${key}?v=${v}`;

// Scrollables' video/thumbnail files live on the separate Pi MinIO
// instance (see src/lib/server/scrollablesMinio.ts), reachable at its own
// Cloudflare Tunnel hostname — NOT the main PUBLIC_CDN_URL. Same
// "already-extensioned key" convention as cdnRawUrl above (video files
// are `${videoKey}.mp4`, thumbnails `${thumbnailKey}.webp`).
export const scrollableCdnRawUrl = (key: string) =>
	`${PUBLIC_SCROLLABLES_CDN_URL}/${PUBLIC_SCROLLABLES_BUCKET_NAME}/${key}?v=${v}`;

export const unreadMessages = writable(0);
// Unlocked-but-not-yet-viewed achievements — drives the gold badge on the
// Achievements nav item, same shape as unreadMessages above but tracked
// separately since it's a different notification surface (a different
// gold color, and clearing it happens by visiting /achievements, not by
// opening the notification bell).
export const unseenAchievements = writable(0);

// Fired whenever a lynt is bookmarked/unbookmarked anywhere in the app
// (feed card, opened-lynt view, profile page, etc). MainPage subscribes to
// this so the Bookmarked tab updates live — unbookmark a post while
// looking at that tab and it disappears immediately instead of needing a
// manual refresh to catch up with what the DB now says.
export const bookmarkToggled = writable<{ lyntId: string; bookmarked: boolean } | null>(null);

export interface FeedItem {
	id: string;
	content: string;
	userId: string;
	createdAt: number;
	editedAt: string | null;
	views: number;
	reposted: boolean;
	likeCount: number;
	likedByFollowed: boolean;
	repostCount: number;
	commentCount: number;
	likedByUser: boolean;
	repostedByUser: boolean;
	handle: string;
	userCreatedAt: number;
	username: string;
	iq: number;
	bio: string;
	verified: boolean;
	has_image: boolean;
	// Badge fields
	isAdmin: boolean;
	contributor: boolean;
	nameColor: string | null;
	loginStreak: number;
	followerCount: number;
	followsViewer: boolean;
	// Parent (repost) fields
	parentId: string | null;
	parentContent: string | null;
	parentUserHandle: string | null;
	parentUserUsername: string | null;
	parentUserVerified: boolean | null;
	parentHasImage: boolean | null;
	parentUserBio: string | null;
	parentUserIq: number | null;
	parentUserId: string | null;
	parentCreatedAt: number | null;
	parentUserCreatedAt: number | null;
}

// ── Presence store ───────────────────────────────────────────
// A Set of userIds who are currently online.
// Updated by SSE events: presence_init and presence_update.
import { writable as _writable } from 'svelte/store';

function createOnlineStore() {
	const { subscribe, update } = _writable<Set<string>>(new Set());
	return {
		subscribe,
		init(ids: string[]) {
			update(() => new Set(ids));
		},
		setOnline(userId: string) {
			update((s) => { s.add(userId); return s; });
		},
		setOffline(userId: string) {
			update((s) => { s.delete(userId); return s; });
		}
	};
}

export const onlineUsers = createOnlineStore();

// ── Typing indicators ────────────────────────────────────────
// Map of lyntId -> Set of userIds currently typing a reply to it.
function createTypingStore() {
	const { subscribe, update } = _writable<Map<string, Set<string>>>(new Map());
	return {
		subscribe,
		start(lyntId: string, userId: string) {
			update((m) => {
				if (!m.has(lyntId)) m.set(lyntId, new Set());
				m.get(lyntId)!.add(userId);
				return new Map(m);
			});
		},
		stop(lyntId: string, userId: string) {
			update((m) => {
				m.get(lyntId)?.delete(userId);
				if (m.get(lyntId)?.size === 0) m.delete(lyntId);
				return new Map(m);
			});
		}
	};
}

export const typingUsers = createTypingStore();

// ── Live viewer counts ──────────────────────────────────────────
// Map of lyntId -> number of tabs currently viewing that lynt's detail panel.
function createViewerCountStore() {
	const { subscribe, update } = _writable<Map<string, number>>(new Map());
	return {
		subscribe,
		set(lyntId: string, count: number) {
			update((m) => {
				if (count <= 0) m.delete(lyntId);
				else m.set(lyntId, count);
				return new Map(m);
			});
		}
	};
}

export const viewerCounts = createViewerCountStore();

// ── Connection status (for a small "reconnecting…" indicator) ───
export const wsConnected = writable(true);
