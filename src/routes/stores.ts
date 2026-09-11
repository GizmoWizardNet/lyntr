import { readable, writable } from 'svelte/store';
import { PUBLIC_CDN_URL, PUBLIC_SCROLLABLES_CDN_URL, PUBLIC_SCROLLABLES_BUCKET_NAME } from '$env/static/public';

export const currentPage = writable('home');
export const pendingForumThreadId = writable<string | null>(null);
export const pendingSearchQuery = writable<string | null>(null);
export const v = String(Math.random());
export const cdnUrl = (filename: string, dimension: string | null = null) => {
	return `${PUBLIC_CDN_URL}/lyntr/${filename}${dimension ? '_' + dimension : ''}.webp?v=${v}`;
};

export const cdnRawUrl = (key: string) => `${PUBLIC_CDN_URL}/lyntr/${key}?v=${v}`;

export const scrollableCdnRawUrl = (key: string) =>
	`${PUBLIC_SCROLLABLES_CDN_URL}/${PUBLIC_SCROLLABLES_BUCKET_NAME}/${key}?v=${v}`;

export const unreadMessages = writable(0);
export const unseenAchievements = writable(0);

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
export const wsConnected = writable(true);
