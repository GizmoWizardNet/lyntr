/**
 * "/bang" commands — forum-only power-user syntax.
 *
 *   /bang dihcord          → cross-posts the forum post to the Lyntr Discord
 *                             (view-only #forum channel, via the existing bot)
 *   /bang bsky              → cross-posts to Bluesky via the Lyntr account
 *                             (verified accounts older than 10h only, 1 per 30m)
 *   /bang cc @a, @b, ...    → emails + notifies up to 5 mentioned users the
 *                             complete forum post (email only if the
 *                             recipient has email notifications enabled)
 *
 * Deliberately spelled "dihcord" in the command itself — see BangCommandsPanel
 * for the in-app explainer shown under the forum stats panel.
 *
 * Only ever called from the forum thread/post endpoints — nothing else
 * (lynts, comments, DMs) parses or executes these.
 */

import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq, inArray } from 'drizzle-orm';
import { createNotification } from '@/server/notifications';
import { bangBskyRatelimit, bangCcRatelimit } from '@/server/ratelimit';
import { stripMarkdownForOg } from '$lib/ogText';

const BANG_LINE_RE = /^[ \t]{0,3}\/bang[ \t]+(\S+)(.*)$/gm;

export const MAX_CC_RECIPIENTS = 5;

export interface BangCommand {
	raw: string;
	target: string; // lowercased first word after "/bang"
	argsRaw: string;
}

export function parseBangCommands(content: string): BangCommand[] {
	const out: BangCommand[] = [];
	for (const m of content.matchAll(BANG_LINE_RE)) {
		out.push({ raw: m[0].trim(), target: m[1].toLowerCase(), argsRaw: (m[2] ?? '').trim() });
	}
	return out;
}

export function validateBangCommands(content: string): string | null {
	const commands = parseBangCommands(content);
	for (const cmd of commands) {
		if (cmd.target === 'cc') {
			const handles = extractCcHandles(cmd.argsRaw);
			if (handles.length > MAX_CC_RECIPIENTS) {
				return `/bang cc can only tag up to ${MAX_CC_RECIPIENTS} people — you tagged ${handles.length}.`;
			}
			if (handles.length === 0) {
				return '/bang cc needs at least one @handle.';
			}
		}
		if (cmd.target !== 'cc' && cmd.target !== 'bsky' && cmd.target !== 'dihcord') {
			return `Unknown /bang target "${cmd.target}". Try dihcord, bsky, or cc.`;
		}
	}
	return null; // ok
}

function extractCcHandles(argsRaw: string): string[] {
	const found = [...argsRaw.matchAll(/@([A-Za-z0-9_]{1,32})/g)].map((m) => m[1].toLowerCase());
	// de-dupe while preserving order
	return [...new Set(found)];
}

export interface BangContext {
	content: string;
	threadId: string;
	threadTitle: string;
	postId: string;
	authorId: string;
}

export interface BangResultSummary {
	discord?: { posted: boolean; error?: string };
	bsky?: { posted: boolean; reason?: string };
	cc?: { sent: string[]; skipped: string[]; reason?: string };
}

export async function executeBangCommands(ctx: BangContext): Promise<BangResultSummary | null> {
	const commands = parseBangCommands(ctx.content);
	if (commands.length === 0) return null;

	const summary: BangResultSummary = {};

	const [author] = await db
		.select({
			username: users.username,
			handle: users.handle,
			verified: users.verified,
			created_at: users.created_at
		})
		.from(users)
		.where(eq(users.id, ctx.authorId))
		.limit(1);
	if (!author) return null;

	for (const cmd of commands) {
		if (cmd.target === 'dihcord') {
			summary.discord = await postToDiscord(ctx, author);
		} else if (cmd.target === 'bsky') {
			summary.bsky = await postToBsky(ctx, author);
		} else if (cmd.target === 'cc') {
			summary.cc = await ccByEmail(ctx, author);
		}
	}

	return summary;
}

async function postToDiscord(
	ctx: BangContext,
	author: { username: string; handle: string; verified: boolean | null }
): Promise<{ posted: boolean; error?: string }> {
	try {
		const res = await fetch('http://bot:5444/forumpost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				threadId: ctx.threadId,
				postId: ctx.postId,
				title: ctx.threadTitle,
				content: stripMarkdownForOg(ctx.content),
				author: { username: author.username, handle: author.handle, verified: !!author.verified }
			})
		});
		if (!res.ok) return { posted: false, error: `bot responded ${res.status}` };
		return { posted: true };
	} catch (err) {
		// The forum post itself already succeeded — this is a best-effort
		// bonus, so a dead bot container should never surface as a hard error.
		return { posted: false, error: err instanceof Error ? err.message : 'unreachable' };
	}
}

// ── /bang bsky ───────────────────────────────────────────────────────────
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const BSKY_POST_MAX = 300; // Bluesky's own grapheme cap; we conservatively count chars

async function postToBsky(
	ctx: BangContext,
	author: { username: string; verified: boolean | null; created_at: Date | null }
): Promise<{ posted: boolean; reason?: string }> {
	if (!author.verified) return { posted: false, reason: 'Only verified accounts can use /bang bsky.' };

	const accountAgeMs = author.created_at ? Date.now() - new Date(author.created_at).getTime() : 0;
	if (accountAgeMs < TEN_HOURS_MS)
		return { posted: false, reason: 'Your account needs to be at least 10 hours old to use /bang bsky.' };

	const { success } = await bangBskyRatelimit.limit(ctx.authorId);
	if (!success) return { posted: false, reason: '/bang bsky can only be used once every 30 minutes.' };

	const identifier = process.env.BSKY_IDENTIFIER;
	const appPassword = process.env.BSKY_APP_PASSWORD;
	const service = process.env.BSKY_SERVICE || 'https://bsky.social';
	if (!identifier || !appPassword) return { posted: false, reason: 'Bluesky posting is not configured.' };

	try {
		// Auth — app-password session, no SDK dependency needed for one call.
		const sessionRes = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ identifier, password: appPassword })
		});
		if (!sessionRes.ok) return { posted: false, reason: 'Could not authenticate with Bluesky.' };
		const session = await sessionRes.json();

		const plain = stripMarkdownForOg(ctx.content);
		const text =
			plain.length > BSKY_POST_MAX
				? `${plain.slice(0, BSKY_POST_MAX - 1)}…`
				: plain || ctx.threadTitle;

		const recordRes = await fetch(`${service}/xrpc/com.atproto.repo.createRecord`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.accessJwt}`
			},
			body: JSON.stringify({
				repo: session.did,
				collection: 'app.bsky.feed.post',
				record: {
					$type: 'app.bsky.feed.post',
					text,
					createdAt: new Date().toISOString()
				}
			})
		});

		if (!recordRes.ok) return { posted: false, reason: 'Bluesky rejected the post.' };
		return { posted: true };
	} catch (err) {
		return { posted: false, reason: err instanceof Error ? err.message : 'Bluesky request failed.' };
	}
}

async function ccByEmail(
	ctx: BangContext,
	author: { username: string; handle: string }
): Promise<{ sent: string[]; skipped: string[]; reason?: string }> {
	const { success } = await bangCcRatelimit.limit(ctx.authorId);
	if (!success)
		return { sent: [], skipped: [], reason: '/bang cc can only be used once every 5 minutes.' };

	const cmd = parseBangCommands(ctx.content).find((c) => c.target === 'cc');
	const handles = cmd ? extractCcHandles(cmd.argsRaw).slice(0, MAX_CC_RECIPIENTS) : [];
	if (handles.length === 0) return { sent: [], skipped: [] };

	const recipients = await db
		.select({
			id: users.id,
			handle: users.handle,
			email_notifications_enabled: users.email_notifications_enabled
		})
		.from(users)
		.where(inArray(users.handle, handles));

	const sent: string[] = [];
	const skipped: string[] = [];
	const plain = stripMarkdownForOg(ctx.content);

	for (const recipient of recipients) {
		if (recipient.id === ctx.authorId) continue; // can't cc yourself

		await createNotification(
			recipient.id,
			'forum_cc',
			ctx.authorId,
			undefined,
			ctx.postId,
			ctx.threadId,
			{ lyntContent: plain, forumThreadTitle: ctx.threadTitle }
		).catch(() => {});

		if (recipient.email_notifications_enabled) {
			sent.push(recipient.handle);
		} else {
			skipped.push(recipient.handle);
		}
	}

	return { sent, skipped };
}