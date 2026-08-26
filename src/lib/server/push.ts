/**
 * Push notification service — Web Push / VAPID.
 *
 * Setup:
 *   1. Run `node scripts/generate-vapid-keys.js` once and add the output to .env
 *   2. Add VAPID_SUBJECT=mailto:you@yourdomain.com to .env
 *
 * Environment variables required:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT
 *
 * If any of these are absent the module silently no-ops, so you can deploy
 * before configuring push without breaking anything.
 */

import webpush from 'web-push';
import { db } from '@/server/db';
import { pushSubscriptions } from '@/server/schema';
import { eq } from 'drizzle-orm';

let initialised = false;

function init() {
	if (initialised) return true;
	const pub  = process.env.VAPID_PUBLIC_KEY;
	const priv = process.env.VAPID_PRIVATE_KEY;
	const subj = process.env.VAPID_SUBJECT;
	if (!pub || !priv || !subj) return false;
	webpush.setVapidDetails(subj, pub, priv);
	initialised = true;
	return true;
}

// ── Notification payload builders ─────────────────────────────────────────
// The service worker receives `data` and uses it to call showNotification().

interface PushPayload {
	title: string;
	body: string;
	icon?: string;
	badge?: string;
	url?: string;
	tag?: string; // collapses duplicate notifs on the same topic
}

function buildPayload(
	type: string,
	actorUsername: string,
	lyntContent?: string | null,
	forumThreadTitle?: string | null,
): PushPayload | null {
	const icon  = '/android-chrome-192x192.png';
	const badge = '/favicon-32x32.png';

	const truncate = (s: string, n = 80) => s.length > n ? s.slice(0, n - 1) + '…' : s;

	switch (type) {
		case 'like':
			return {
				title: `${actorUsername} liked your lynt`,
				body: lyntContent ? truncate(lyntContent) : '',
				icon, badge, tag: `like-${actorUsername}`,
				url: '/'
			};
		case 'comment':
			return {
				title: `${actorUsername} replied to you`,
				body: lyntContent ? truncate(lyntContent) : '',
				icon, badge, tag: `comment`,
				url: '/'
			};
		case 'repost':
			return {
				title: `${actorUsername} reposted your lynt`,
				body: lyntContent ? truncate(lyntContent) : '',
				icon, badge, tag: `repost`,
				url: '/'
			};
		case 'follow':
			return {
				title: `${actorUsername} followed you`,
				body: 'You have a new follower.',
				icon, badge, tag: `follow-${actorUsername}`,
				url: `/@${actorUsername}`
			};
		case 'mention':
			return {
				title: `${actorUsername} mentioned you`,
				body: lyntContent ? truncate(lyntContent) : '',
				icon, badge, tag: 'mention',
				url: '/'
			};
		case 'forum_upvote':
			return {
				title: `${actorUsername} upvoted your post`,
				body: forumThreadTitle ? truncate(forumThreadTitle) : 'In the forum',
				icon, badge, tag: `forum-upvote`,
				url: '/'
			};
		case 'forum_reply':
			return {
				title: `${actorUsername} replied in your thread`,
				body: forumThreadTitle ? truncate(forumThreadTitle) : '',
				icon, badge, tag: `forum-reply`,
				url: '/'
			};
		case 'dm_request':
			return {
				title: `${actorUsername} wants to message you`,
				body: 'Open Lyntr to accept or decline.',
				icon, badge, tag: 'dm-request',
				url: '/'
			};
		case 'dm_accepted':
			return {
				title: `${actorUsername} accepted your message request`,
				body: 'You can now send each other messages.',
				icon, badge, tag: 'dm-accepted',
				url: '/'
			};
		case 'clan_invite':
			return {
				title: `${actorUsername} added you to a clan lynt`,
				body: lyntContent ? `Accept or decline: ${truncate(lyntContent)}` : 'Open Lyntr to accept or decline.',
				icon, badge, tag: 'clan-invite',
				url: '/'
			};
		case 'clan_declined':
			return {
				title: `${actorUsername} declined a clan lynt`,
				body: 'The draft was deleted.',
				icon, badge, tag: 'clan-declined',
				url: '/'
			};
		case 'clan_live':
			return {
				title: 'Your clan lynt is live',
				body: lyntContent ? truncate(lyntContent) : '',
				icon, badge, tag: 'clan-live',
				url: '/'
			};
		case 'dm_message':
			return {
				title: `New message from ${actorUsername}`,
				body: lyntContent ? truncate(lyntContent) : '',
				icon, badge, tag: `dm-${actorUsername}`,
				url: '/'
			};
		default:
			return null;
	}
}

// ── Public send function ───────────────────────────────────────────────────
export interface PushOptions {
	recipientId: string;
	type: string;
	actorUsername: string;
	lyntContent?: string | null;
	forumThreadTitle?: string | null;
}

export async function sendPushNotification(opts: PushOptions): Promise<void> {
	if (!init()) return; // VAPID not configured

	const payload = buildPayload(opts.type, opts.actorUsername, opts.lyntContent, opts.forumThreadTitle);
	if (!payload) return;

	// Fetch all subscriptions for this user
	const subs = await db
		.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.user_id, opts.recipientId));

	if (subs.length === 0) return;

	const jsonPayload = JSON.stringify(payload);
	const staleIds: string[] = [];

	await Promise.allSettled(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					jsonPayload,
					{ TTL: 60 * 60 * 24 } // 24h TTL — browser delivers when next online
				);
			} catch (err: any) {
				// 410 Gone = subscription expired/revoked. Clean it up.
				if (err?.statusCode === 410 || err?.statusCode === 404) {
					staleIds.push(sub.id);
				} else {
					console.error('[push] send error:', err?.message ?? err);
				}
			}
		})
	);

	// Prune stale subscriptions in the background
	if (staleIds.length > 0) {
		for (const id of staleIds) {
			db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).catch(() => {});
		}
	}
}
