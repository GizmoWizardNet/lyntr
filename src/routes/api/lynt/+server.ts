import { json } from '@sveltejs/kit';
import type { Cookies, RequestHandler } from '@sveltejs/kit';
import { verifyAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { lynts, users, polls, pollOptions, lyntImages } from '@/server/schema';
import { eq, sql } from 'drizzle-orm';
import { Snowflake } from 'nodejs-snowflake';
import { minioClient } from '@/server/minio';
import { deleteLynt, lyntObj, hydratePoll, processAndUploadLyntImages, MAX_LYNT_IMAGES } from '../util';
import { processMentions } from '@/server/mentions';
import { processHashtags } from '@/server/hashtags';
import { sendMessage, broadcastRepostUpdate, broadcastLyntEdited } from '@/sse';
import { moderateContent, NSFW_ERROR } from '@/moderation';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { fetchReferencedLynts } from "../util"
import { awardPostCreated, awardRepostReceived } from '@/server/lyntcoins';
import { createNotification } from '@/server/notifications';
import { notifyLyntEngagement } from '@/server/clanLynt';

export const POST: RequestHandler = async ({
	request,
	cookies
}: {
	request: Request;
	cookies: Cookies;
}) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	let userId: string;

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		userId = jwtPayload.userId;

		if (!userId) {
			throw new Error('Invalid JWT token');
		}
	} catch (error) {
		console.error('Authentication error:', error);
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	const muteCheck = await fetch(
		`http://bot:5444/muted/${userId}`
	).then(r => r.json()).catch(() => ({ muted: false }));

	if (muteCheck.muted) {
		return json({ error: 'You are muted.' }, { status: 403 });
	}

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) {
		return json({ error: 'You are being ratelimited.' }, { status: 429 });
	}

	const formData = await request.formData();

	let content = formData.get('content') as string;
	// 'images' (plural, appended once per file) is the current contract.
	// 'image' (singular) is kept for any not-yet-updated clients.
	const imageFiles = [
		...(formData.get('image') ? [formData.get('image') as File] : []),
		...formData.getAll('images').filter((f): f is File => f instanceof File)
	].slice(0, MAX_LYNT_IMAGES);
	const gifUrl = formData.get('gif_url') as string | null;
	const gifPreviewUrl = formData.get('gif_preview_url') as string | null;
	const reposted = formData.get('reposted') as string;
	const pollJson = formData.get('poll') as string | null;

	if (!content) content = '';

	if (content.length > 280) {
		return json({ error: 'Invalid content' }, { status: 400 });
	}

	if (imageFiles.length > 0 && gifUrl) {
		return json({ error: 'Choose either images or a GIF, not both' }, { status: 400 });
	}
	if (gifUrl && (!gifUrl.startsWith('https://') || !gifPreviewUrl?.startsWith('https://'))) {
		return json({ error: 'Invalid GIF URL' }, { status: 400 });
	}

	const verdict = await moderateContent(content);
	if (!verdict.allowed) {
		return json({ error: verdict.reason }, { status: 400 });
	}

	try {
		const lyntId = new Snowflake({
			custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime()
		});

		const uniqueLyntId = String(lyntId.getUniqueID());

		let lyntValues: any = {
			id: uniqueLyntId,
			user_id: userId,
			content: content,
			has_link: content.includes('http')
		};

		let repostedAuthorId: string | null = null;
		let pendingImageRows: { lynt_id: string; image_key: string; position: number }[] = [];

		let repostedIsClan = false;
		let repostedContent = '';
		if (reposted) {
			const [existingLynt] = await db
				.select({ id: lynts.id, user_id: lynts.user_id, content: lynts.content, is_clan: lynts.is_clan })
				.from(lynts)
				.where(eq(lynts.id, reposted))
				.limit(1);

			if (existingLynt) {
				lyntValues.reposted = true;
				lyntValues.parent = reposted;
				repostedAuthorId = existingLynt.user_id;
				repostedIsClan = existingLynt.is_clan;
				repostedContent = existingLynt.content;
			} else {
				return json({ error: 'Invalid reposted lynt ID' }, { status: 400 });
			}
		}

		if (imageFiles.length > 0) {
			try {
				pendingImageRows = await processAndUploadLyntImages(imageFiles, uniqueLyntId, minioClient);
			} catch (err) {
				if (err instanceof Error && err.message === 'NSFW') return NSFW_ERROR;
				throw err;
			}
			lyntValues.has_image = true;
		}

		if (gifUrl && !lyntValues.reposted) {
			lyntValues.gif_url = gifUrl;
			lyntValues.gif_preview_url = gifPreviewUrl || gifUrl;
		}

		const [newLynt] = await db.insert(lynts).values(lyntValues).returning();

		if (pendingImageRows.length > 0) {
			await db.insert(lyntImages).values(pendingImageRows);
		}

		sendMessage(uniqueLyntId);

		// ── Everything below this line is non-critical to the client's
		// "your lynt is posted" response: polls, @mentions, #hashtags,
		// LyntCoins awarding, and repost notifications. None of it needs
		// to block the HTTP response — the lynt already exists and the
		// SSE message already went out. Kick it off and let it resolve
		// in the background; errors are logged, never surfaced to the
		// poster (a failed mention scan shouldn't make posting "fail").
		const finishSideEffects = async () => {
			// ── Poll ──────────────────────────────────────────────────
			if (pollJson && !lyntValues.reposted && !gifUrl) {
				try {
					const pollData = JSON.parse(pollJson) as {
						title: string;
						multi_select: boolean;
						resolve_at: string | null;
						options: string[];
					};

					if (
						pollData.title?.trim() &&
						Array.isArray(pollData.options) &&
						pollData.options.length >= 2 &&
						pollData.options.length <= 10
					) {
						const [newPoll] = await db.insert(polls).values({
							lynt_id: newLynt.id,
							title: pollData.title.trim().slice(0, 140),
							multi_select: pollData.multi_select ?? false,
							resolve_at: pollData.resolve_at ? new Date(pollData.resolve_at) : null
						}).returning({ id: polls.id });

						await db.insert(pollOptions).values(
							pollData.options
								.filter(o => o?.trim())
								.slice(0, 10)
								.map((text, position) => ({
									poll_id: newPoll.id,
									text: text.trim().slice(0, 100),
									position
								}))
						);
					}
				} catch (pollError) {
					console.error('Poll creation error (non-fatal):', pollError);
				}
			}

			// @mentions: skip for pure reposts — their `content` is just the
			// optional repost caption/decoration, and reposted-with-no-comment
			// has nothing meaningful to scan anyway. A repost WITH added
			// commentary still gets mentions processed normally below since
			// `content` in that case is real authored text.
			try {
				if (!lyntValues.reposted || content.trim().length > 0) {
					await processMentions(content, userId, newLynt.id);
					await processHashtags(content, newLynt.id);
				}
			} catch (mentionError) {
				console.error('Mentions/hashtags error (non-fatal):', mentionError);
			}

			// ── LyntCoins ──────────────────────────────────────────────
			try {
				if (lyntValues.reposted && repostedAuthorId) {
					await awardRepostReceived(repostedAuthorId, userId, reposted);
					if (repostedAuthorId !== userId) {
						await notifyLyntEngagement(reposted, repostedAuthorId, repostedIsClan, 'repost', userId, newLynt.id, {
							lyntContent: repostedContent
						});
					}
				} else if (!lyntValues.reposted) {
					await awardPostCreated(userId, newLynt.id);
				}
			} catch (lcError) {
				console.error('LyntCoins award error (post creation):', lcError);
			}

			// ── Live repost count ────────────────────────────────────────
			// repostCount was previously only ever correct after a manual
			// refetch — nothing told viewers of the original lynt (including
			// the person who just reposted it) that the count had changed.
			// Same pattern as broadcastLikeUpdate: recompute and push it out.
			if (lyntValues.reposted) {
				try {
					const [{ count: freshRepostCount }] = await db
						.select({ count: sql<number>`count(*)` })
						.from(lynts)
						.where(sql`${lynts.parent} = ${reposted} and ${lynts.reposted} = true`);
					broadcastRepostUpdate(reposted, Number(freshRepostCount), userId);
				} catch (broadcastError) {
					console.error('Repost broadcast error (non-fatal):', broadcastError);
				}
			}
		};

		// Don't await — let it run after the response is sent.
		finishSideEffects().catch(err =>
			console.error('Unhandled error in post-creation side effects:', err)
		);

		return json(newLynt, { status: 201 });
	} catch (error) {
		console.error('Error creating lynt:', error);
		return json({ error: 'Failed to create lynt' }, { status: 500 });
	}
};

// NEW: edit a lynt's text content
export const PATCH: RequestHandler = async ({
	request,
	cookies
}: {
	request: Request;
	cookies: Cookies;
}) => {
	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	let userId: string;
	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		userId = jwtPayload.userId;
		if (!userId) throw new Error('Invalid JWT token');
	} catch {
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	const { success } = await sensitiveRatelimit.limit(userId);
	if (!success) {
		return json({ error: 'You are being ratelimited.' }, { status: 429 });
	}

	let body: { id: string; content: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { id: lyntId, content } = body;

	if (!lyntId) {
		return json({ error: 'Missing lynt ID' }, { status: 400 });
	}
	if (!content || typeof content !== 'string') {
		return json({ error: 'Missing content' }, { status: 400 });
	}
	if (content.length > 280) {
		return json({ error: 'Content exceeds 280 characters' }, { status: 400 });
	}

	try {
		const [lynt] = await db
			.select({ id: lynts.id, user_id: lynts.user_id, reposted: lynts.reposted })
			.from(lynts)
			.where(eq(lynts.id, lyntId))
			.limit(1);

		if (!lynt) {
			return json({ error: 'Lynt not found' }, { status: 404 });
		}
		if (lynt.user_id !== userId) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}
		// Reposts are just pointers — their "content" is decorative; block editing them
		// to avoid confusion. Pure reposts have no original text to edit.
		if (lynt.reposted) {
			return json({ error: 'Reposts cannot be edited' }, { status: 400 });
		}

		const [updated] = await db
			.update(lynts)
			.set({
				content,
				has_link: content.includes('http'),
				edited_at: new Date()
			})
			.where(eq(lynts.id, lyntId))
			.returning();

		// Re-scan for @mentions on edit. The upsert in processMentions means
		// re-mentioning someone who was already mentioned just bumps their
		// existing notification (mention_count++, read reset to false)
		// rather than creating a duplicate — and a handle added for the
		// first time during the edit still creates a fresh notification.
		await processMentions(content, userId, lyntId);
		await processHashtags(content, lyntId);

		// Live-patch anyone currently viewing this lynt (detail panel open,
		// or it's sitting in their feed) instead of leaving them looking at
		// stale content until their next refetch.
		broadcastLyntEdited(lyntId, {
			content: updated.content,
			hasLink: !!updated.has_link,
			editedAt: (updated.edited_at as Date).toISOString()
		});

		return json({ message: 'Lynt updated', lynt: updated }, { status: 200 });
	} catch (error) {
		console.error('Error editing lynt:', error);
		return json({ error: 'Failed to edit lynt' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({
	url,
	request,
	cookies
}: {
	url: URL;
	request: Request;
	cookies: Cookies;
}) => {
	let userId: string | null;

	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');
	const admin = request.headers.get('Authorization');

	if (admin === process.env.ADMIN_KEY && process.env.SUDO_USER_ID) {
		userId = process.env.SUDO_USER_ID;
	} else {
		try {
			const jwtPayload = await verifyAuthJWT(authCookie);

			userId = jwtPayload.userId;

			if (!userId) {
				throw new Error('Invalid JWT token');
			}
		} catch (error) {
			userId = null
		}
	}
	const lyntId = url.searchParams.get('id');

	if (!lyntId) {
		return json({ error: 'Missing lynt ID' }, { status: 400 });
	}

	try {
		const lyntobj = lyntObj(userId);

		const [lynt] = await db
			.select({ ...lyntobj, parent: lynts.parent, edited_at: lynts.edited_at })
			.from(lynts)
			.leftJoin(users, eq(lynts.user_id, users.id))
			.where(eq(lynts.id, lyntId))
			.limit(1);

		if (!lynt) {
			return json({ error: 'Lynt not found' }, { status: 404 });
		}

		// Poll data (if any) already came back as part of the select above,
		// via lyntObj's pollJson subquery — no separate round-trip needed
		// here anymore. The view-count bump and the referenced-lynt-chain
		// walk don't depend on each other, so run them concurrently instead
		// of serially.
		const [, referencedLynts] = await Promise.all([
			db.execute(sql`UPDATE ${lynts} SET views = views + 1 WHERE id = ${lyntId}`),
			fetchReferencedLynts(userId, lynt.parent)
		]);

		return json({ ...hydratePoll(lynt), referencedLynts });
	} catch (error) {
		console.error('Error fetching lynt:', error);
		return json({ error: 'Failed to fetch lynt' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({
	request,
	url,
	cookies
}: {
	request: Request;
	url: URL;
	cookies: Cookies;
}) => {
	const admin = request.headers.get('Authorization');
	const lyntId = url.searchParams.get('id');

	if (!lyntId) {
		return json({ error: 'Missing lynt ID' }, { status: 400 });
	}

	if (admin === process.env.ADMIN_KEY) {
		await deleteLynt(lyntId);
		return json({ message: 'Done' }, { status: 200 });
	}

	const authCookie = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authCookie) {
		return json({ error: 'Missing authentication' }, { status: 401 });
	}

	let userId: string;

	try {
		const jwtPayload = await verifyAuthJWT(authCookie);
		userId = jwtPayload.userId;

		if (!userId) {
			throw new Error('Invalid JWT token');
		}
	} catch (error) {
		console.error('Authentication error:', error);
		return json({ error: 'Authentication failed' }, { status: 401 });
	}

	try {
		const [lynt] = await db
			.select({ id: lynts.id, user_id: lynts.user_id })
			.from(lynts)
			.where(eq(lynts.id, lyntId))
			.limit(1);

		if (!lynt) {
			return json({ error: 'Lynt not found' }, { status: 404 });
		}

		if (lynt.user_id !== userId) {
			return json({ error: 'Unauthorized to delete this lynt' }, { status: 403 });
		}

		await deleteLynt(lyntId);

		return json({ message: 'Lynt and related data deleted successfully' }, { status: 200 });
	} catch (error) {
		console.error('Error deleting lynt:', error);
		return json({ error: 'Failed to delete lynt' }, { status: 500 });
	}
};
