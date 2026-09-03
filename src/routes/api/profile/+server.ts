import { json } from '@sveltejs/kit';
import { TURNSTILE_SECRET_KEY } from '$env/static/private';
import type { Cookies, RequestHandler } from '@sveltejs/kit';

import { Snowflake } from 'nodejs-snowflake';

import { verifyAuthJWT, createAuthJWT } from '@/server/jwt';
import { db } from '@/server/db';
import { followers, likes, lynts, notifications, users, history, bookmarks, userAchievements, forumPostVotes, forumThreads, forumPosts, lcTransactions } from '@/server/schema';
import { eq, inArray, or, sql } from 'drizzle-orm';
import { minioClient } from '@/server/minio';
import sharp from 'sharp';
import { deleteLynt, uploadAvatar, assertReasonableFrameCount } from '../util';
import { readFileSync } from 'fs';
import sanitizeHtml from 'sanitize-html';
import { isImageNsfw, NSFW_ERROR } from '@/moderation';
import { sensitiveRatelimit } from '@/server/ratelimit';
import { encryptApiKey } from '@/server/rugplayCrypto';
import { validateRugplayKey } from '@/server/rugplayKeys';
import { isValidNameColor } from '@/nameColors';
import { parseYoutubeId } from '@/youtube';


// ── Cloudflare Turnstile verification ───────────────────────────────────
async function verifyTurnstile(token: string, remoteip?: string): Promise<boolean> {
	if (!TURNSTILE_SECRET_KEY || TURNSTILE_SECRET_KEY === 'REPLACE_ME') return true; // dev bypass
	try {
		const form = new FormData();
		form.append('secret', TURNSTILE_SECRET_KEY);
		form.append('response', token);
		if (remoteip) form.append('remoteip', remoteip);

		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body: form,
		});
		const data = await res.json();
		return data.success === true;
	} catch {
		return false; // fail open — never block legit users on network hiccup
	}
}

interface Question {
	id: string;
	condition: Function;
}

let questions: Question[] = [
	{
		id: 'AGI',
		condition: (input: any) => {
			return santize(input) === 'artificialgeneralintelligence' ? -3 : 4;
		}
	},
	{
		id: 'CatQuestion',
		condition: (input: any) => {
			return sanitizeBool(input) === true ? -2 : 1;
		}
	},
	{
		id: 'ShortFormContent',
		condition: (input: any) => {
			return -1 * Math.min(sanitizeNum(input), 12);
		}
	},
	{
		id: 'Chemistry',
		condition: (input: any) => {
			return santize(input as string) === 'francium' ? 10 : -5;
		}
	},
	{
		id: 'GPT',
		condition: (input: any) => {
			return santize(input) === 'generativepretrainedtransformer' ? 5 : -3;
		}
	},
	{
		id: 'MathQuestion',
		condition: (input: any) => {
			return parseInt(input) === 30 ? 8 : -20;
		}
	},
	{
		id: 'ContentCreators',
		condition: (input: any) => {
			return Math.floor(-1 * Math.floor(Math.min(sanitizeNum(input), 47) * 0.25));
		}
	},
	{
		id: 'MathProblem',
		condition: (input: any) => {
			return parseInt(input) === 9 ? 15 : -10;
		}
	},
	{
		id: 'SequenceSymbol',
		condition: (input: any) => {
			return input === 'idfk' ? 10 : -7;
		}
	},
	{
		id: 'SequenceNumber',
		condition: (input: any) => {
			return parseInt(input) === 42 ? 9 : -3;
		}
	},
	{
		id: 'Dexerto',
		condition: (input: any) => {
			return sanitizeBool(input) == true ? -25 : 25;
		}
	},
	{
		id: 'MathProblemComplex',
		condition: (input: any) => {
			return parseInt(input) === 355 ? 25 : 0;
		}
	},
	{
		id: 'TypingTest',
		condition: (input: any) => {
			return Math.floor(Math.min(sanitizeNum(input), 120) * 0.5);
		}
	},
	{
		id: 'AudioRick',
		condition: (input: any) => {
			return sanitizeBool(input) ? -13 : 5;
		}
	},
	{
		id: 'Degree',
		condition: (input: any) => {
			return sanitizeBool(input) ? 0 : -5;
		}
	},
	{
		id: 'AudioAgeOfWar',
		condition: (input: any) => {
			return sanitizeBool(input) ? 15 : -5;
		}
	},
	{
		id: 'British',
		condition: (_: any) => {
			return 0;
		}
	},
	{
		id: 'Kubernete',
		condition: (input: any) => {
			return sanitizeBool(input) ? -3 : 0;
		}
	},
	{
		id: 'ReactionImage',
		condition: (input: any) => {
			return sanitizeBool(input) ? -10 : 5;
		}
	},
	{
		id: 'GimmickAccount',
		condition: (input: any) => {
			return sanitizeBool(input) ? -5 : 5;
		}
	}
];

const inputBuffer = readFileSync('static/default.png');

export const POST: RequestHandler = async ({
	request,
	cookies
}: {
	request: Request;
	cookies: Cookies;
}) => {
	const { success } = await sensitiveRatelimit.limit(
		request.headers.get('CF-Connecting-IP') ?? '127.0.0.1'
	);
	if (!success) {
		return json({ error: 'You are being ratelimited.' }, { status: 429 });
	}

	// ── Identify auth provider ─────────────────────────────────
	const discordToken = cookies.get('temp-discord-token');
	const googleToken  = cookies.get('temp-google-token');
	const googleUser   = cookies.get('temp-google-user');

	let userEmail: string;
	let providerName: string;

	if (discordToken) {
		// Discord path — fetch email from Discord (same as before)
		const meRes = await fetch('https://discord.com/api/v10/users/@me', {
			headers: { Authorization: 'Bearer ' + discordToken }
		});
		if (!meRes.ok) return json({ error: 'Invalid Discord token' }, { status: 401 });
		const meBody = await meRes.json();
		if (!meBody.email) return json({ error: 'No email from Discord' }, { status: 400 });
		userEmail = meBody.email;
		providerName = 'discord';
	} else if (googleToken && googleUser) {
		// Google path — user info was cached in the cookie during callback
		try {
			const parsed = JSON.parse(googleUser);
			if (!parsed.email) throw new Error('No email');
			userEmail = parsed.email;
			providerName = 'google';
		} catch {
			return json({ error: 'Invalid Google session' }, { status: 401 });
		}
	} else {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = await request.json();

	// ── Turnstile CAPTCHA check ────────────────────────────────
	const cfIp = request.headers.get('CF-Connecting-IP') ?? undefined;
	const turnstileOk = await verifyTurnstile(body.turnstileToken ?? '', cfIp);
	if (!turnstileOk) {
		return json({ error: 'CAPTCHA verification failed. Please try again.' }, { status: 400 });
	}

	if (!body.handle || !body.username || !userEmail) {
		return json({ error: 'Invalid request - missing fields.' }, { status: 400 });
	}

	if (body.handle.length > 32 || body.username.length > 60) {
		return json(
			{ error: 'Handle (32) or username (60) are over the character limit.' },
			{ status: 400 }
		);
	}

	const existingUser = await db
		.select()
		.from(users)
		.where(eq(users.email, userEmail))
		.limit(1);

	if (existingUser.length > 0) {
		return json({ error: 'Email already in use' }, { status: 409 });
	}

	let totalIQ = 80;
	let formattedText = '';

	for (const question of questions) {
		if (body[question.id] !== undefined) {
			const iqChange = question.condition(body[question.id]);
			totalIQ += iqChange;
			formattedText += `${question.id} = ${iqChange > 0 ? '+' : ''}${iqChange} IQ\n`;
		} else {
			return json({ error: `Missing question: ${question.id}` }, { status: 400 });
		}
	}

	try {
		const userId = new Snowflake({
			custom_epoch: new Date('2024-07-13T11:29:44.526Z').getTime()
		});
		const uniqueUserId = String(userId.getUniqueID());
		const cleanedHandle = body.handle.replace(/[^0-9a-z_-]/gi, '').toLowerCase();

		const jwt = await createAuthJWT({ userId: uniqueUserId, timestamp: Date.now() });

		const [newUser] = await db
			.insert(users)
			.values({
				id:       uniqueUserId,
				handle:   cleanedHandle,
				iq:       totalIQ,
				token:    jwt,
				email:    userEmail,
				username: body.username.replace('\n', ' ')
			})
			.returning();

		// Upload default avatar
		const defaultAvatar = readFileSync('static/default.png');
		if (!(await isImageNsfw(defaultAvatar))) {
			uploadAvatar(defaultAvatar, uniqueUserId, minioClient);
		}

		cookies.set('_TOKEN__DO_NOT_SHARE', jwt, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 31536000
		});

		// Clear temp auth cookies
		cookies.delete('temp-discord-token', { path: '/' });
		cookies.delete('temp-google-token',  { path: '/' });
		cookies.delete('temp-google-user',   { path: '/' });

		return json(
			{ ...newUser, totalIQ, formattedText: formattedText.trim() },
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error creating user:', error);
		return json({ error: 'Failed to create user.' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url }) => {
	const userHandle = url.searchParams.get('handle');
	const userId = url.searchParams.get('id');

	if (!userHandle && !userId) {
		return json({ error: 'Missing user handle or id.' }, { status: 400 });
	}

	try {
           // viewerId is optional — used for the rocket badge (do I follow them?)
           const viewerId = url.searchParams.get('viewerId');

                const query = sql`
              		SELECT
                		u.id,
                		u.handle,
                		u.created_at,
                		u.username,
                		u.iq,
                		u.verified,
                		u.bio,
                		u.banner,
                		u.is_admin,
                		u.contributor,
                		u.login_streak,
                		u.name_color,
                		u.profile_song_type,
                		u.profile_song_url,
                		u.profile_song_title,
                		u.profile_song_volume,
                		u.profile_song_loop,
                		u.lynt_coins,
                		u.aura_score,
                		u.pinned_achievement_key,
                		u.rugplay_username,
                		u.rugplay_enhancements_enabled,
                		u.rugplay_key_valid,
                		(u.rugplay_api_key_enc IS NOT NULL) AS rugplay_key_set,
                		u.email_notifications_enabled,
                		(u.notification_email IS NOT NULL) AS notification_email_set,
                		(SELECT COUNT(*) FROM ${followers} WHERE user_id = u.id) AS followers_count,
                		(SELECT COUNT(*) FROM ${followers} WHERE follower_id = u.id) AS following_count,
                		${viewerId
                    		? sql`EXISTS(SELECT 1 FROM ${followers} WHERE follower_id = ${viewerId} AND user_id = u.id)`
                    		: sql`false`
                		} AS viewer_follows
                		FROM ${users} u
            			WHERE ${userHandle ? sql`u.handle = ${userHandle}` : sql`u.id = ${userId}`} AND u.banned = false
            			LIMIT 1
              	`;

		// The achievements query is independent of the main user query's
		// *result* — it just needs the same handle/id to resolve the user
		// row, which it can do itself via a join, mirroring the main
		// query's WHERE clause. So instead of awaiting the user query,
		// then awaiting achievements afterward (two round trips back to
		// back on every single profile visit), fire both at once.
		const achievementsQuery = sql`
			SELECT ua.achievement_key, ua.unlocked_at
			FROM ${userAchievements} ua
			JOIN ${users} u ON u.id = ua.user_id
			WHERE ${userHandle ? sql`u.handle = ${userHandle}` : sql`u.id = ${userId}`} AND u.banned = false
		`;

		const [result, achievementRows] = await Promise.all([
			db.execute(query),
			db.execute(achievementsQuery)
		]);
		const user = result[0];

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

                return json({
                        id: user.id,
                        handle: user.handle,
                        created_at: user.created_at,
                        username: user.username,
                        iq: user.iq,
                        verified: user.verified,
                        followers: parseInt(String(user.followers_count)),
                        following: parseInt(String(user.following_count)),
                        bio: user.bio,
                        banner: user.banner ?? null,
                        is_admin: user.is_admin ?? false,
                        contributor: user.contributor ?? false,
                        login_streak: user.login_streak ?? 1,
                        name_color: user.name_color ?? null,
                        profile_song_type: user.profile_song_type ?? null,
                        profile_song_url: user.profile_song_url ?? null,
                        profile_song_title: user.profile_song_title ?? null,
                        profile_song_volume: user.profile_song_volume ?? 50,
                        profile_song_loop: user.profile_song_loop ?? true,
                        lynt_coins: parseInt(String(user.lynt_coins ?? 0)),
                        aura_score: parseInt(String(user.aura_score ?? 0)),
                        pinned_achievement_key: user.pinned_achievement_key ?? null,
                        achievements: achievementRows.map((a: any) => ({ key: a.achievement_key, unlocked_at: a.unlocked_at })),
                        rugplay_username: user.rugplay_username ?? null,
                        rugplay_enhancements_enabled: user.rugplay_enhancements_enabled ?? false,
                        rugplay_key_valid: user.rugplay_key_valid ?? false,
                        rugplay_key_set: user.rugplay_key_set ?? false,
                        email_notifications_enabled: user.email_notifications_enabled ?? false,
                        notification_email_set: user.notification_email_set ?? false,
                        viewer_follows: user.viewer_follows ?? false,
                });

	} catch (error) {
		console.error('Error fetching user:', error);
		return json({ error: 'Failed to fetch user' }, { status: 500 });
	}
};

// Shared by both PATCH branches (multipart + JSON). Mutates `updateData` in
// place. Returns an error string on failure, or null on success.
async function applyRugplayEnhancementFields(
	updateData: Partial<typeof users.$inferInsert>,
	enabled: boolean | undefined,
	apiKey: string | undefined | null
): Promise<string | null> {
	if (apiKey !== undefined && apiKey !== null) {
		if (apiKey === '') {
			// Explicit clear — e.g. user hit "Remove key"
			updateData.rugplay_api_key_enc = null;
			updateData.rugplay_key_valid = false;
			updateData.rugplay_key_checked_at = new Date();
		} else {
			const ok = await validateRugplayKey(apiKey);
			if (!ok) {
				return "That Rugplay API key couldn't be verified — double check it starts with rgpl_ and is still valid.";
			}
			updateData.rugplay_api_key_enc = encryptApiKey(apiKey);
			updateData.rugplay_key_valid = true;
			updateData.rugplay_key_checked_at = new Date();
		}
	}

	if (enabled !== undefined) {
		updateData.rugplay_enhancements_enabled = enabled;
	}

	return null;
}

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const authToken = cookies.get('_TOKEN__DO_NOT_SHARE');

	if (!authToken) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let userId: string;
	try {
		const decodedToken = await verifyAuthJWT(authToken);
		userId = decodedToken.userId;
	} catch {
		return json({ error: 'Invalid token' }, { status: 401 });
	}

	// Needed to gate name_color — custom colors are a verified-only perk.
	// Also grabs the existing profile song so we can clean up its S3
	// object if it's being replaced or cleared.
	const [currentUser] = await db
		.select({ verified: users.verified, profile_song_type: users.profile_song_type, profile_song_url: users.profile_song_url })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const isVerified = currentUser?.verified ?? false;

	const contentType = request.headers.get('content-type') ?? '';
	const updateData: Partial<typeof users.$inferInsert> = {};

	if (contentType.includes('multipart/form-data')) {
		// Path taken when a banner image is included
		const formData = await request.formData();
		const bio = formData.get('bio') as string | null;
		const username = formData.get('username') as string | null;
		const bannerFile = formData.get('banner') as File | null;
		const rugplayUsername = formData.get('rugplay_username') as string | null;

		if (bio) {
			if (bio.length > 256) {
				return json({ error: 'Bio must be 256 characters or less' }, { status: 400 });
			}
			updateData.bio = bio;
		}
		if (username) {
			if (username.length > 60) {
				return json({ error: 'Username must be 60 characters or less' }, { status: 400 });
			}
			updateData.username = username;
		}
		if (rugplayUsername !== null) {
			updateData.rugplay_username = sanitizeRugplayUsername(rugplayUsername);
		}

		const nameColorRaw = formData.get('name_color') as string | null;
		if (nameColorRaw !== null) {
			const nameColor = nameColorRaw === '' ? null : nameColorRaw;
			if (nameColor !== null && !isVerified) {
				return json({ error: 'Get verified to unlock name colors' }, { status: 403 });
			}
			if (!isValidNameColor(nameColor)) {
				return json({ error: 'Invalid name color' }, { status: 400 });
			}
			updateData.name_color = nameColor;
		}

		const enhancementsEnabledRaw = formData.get('rugplay_enhancements_enabled') as string | null;
		const apiKeyRaw = formData.get('rugplay_api_key') as string | null;
		const enhErr = await applyRugplayEnhancementFields(
			updateData,
			enhancementsEnabledRaw === null ? undefined : enhancementsEnabledRaw === 'true',
			apiKeyRaw
		);
		if (enhErr) return json({ error: enhErr }, { status: 400 });

		if (bannerFile) {
			const buffer = Buffer.from(await bannerFile.arrayBuffer());

			if (await isImageNsfw(buffer)) {
				return NSFW_ERROR;
			}

			try {
				await assertReasonableFrameCount(buffer);
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Invalid image';
				return json({ error: message }, { status: 400 });
			}

			// Resize to a sensible banner dimension (1500×500) and store as WebP.
			// `{ animated: true }` on the sharp() constructor keeps every frame
			// of an animated source instead of collapsing to the first — same
			// fix as uploadAvatar() in api/util.ts.
			const resized = await sharp(buffer, { animated: true })
				.resize(1500, 500, { fit: 'cover', position: 'centre' })
				.webp({ quality: 80 })
				.toBuffer();

			const bannerKey = `${userId}_banner.webp`;
			await minioClient.putObject(
				process.env.S3_BUCKET_NAME!,
				bannerKey,
				resized,
				resized.length,
				{ 'Content-Type': 'image/webp' }
			);

			updateData.banner = bannerKey;
		}

		// ── Profile song ────────────────────────────────────────────────
		const PROFILE_SONG_MAX_BYTES = 25 * 1024 * 1024; // 25MB
		const SONG_EXT_CONTENT_TYPE: Record<string, string> = {
			mp3: 'audio/mpeg',
			ogg: 'audio/ogg',
			wav: 'audio/wav',
			m4a: 'audio/mp4',
			weba: 'audio/webm'
		};

		const songAction = formData.get('profile_song_action') as string | null; // 'upload' | 'youtube' | 'clear' | null
		const oldSongType = currentUser?.profile_song_type ?? null;
		const oldSongUrl = currentUser?.profile_song_url ?? null;

		async function deleteOldUploadedSong() {
			if (oldSongType === 'upload' && oldSongUrl) {
				try {
					await minioClient.removeObject(process.env.S3_BUCKET_NAME!, oldSongUrl);
				} catch (e) {
					console.error('Failed to remove old profile song object:', e);
				}
			}
		}

		if (songAction === 'clear') {
			await deleteOldUploadedSong();
			updateData.profile_song_type = null;
			updateData.profile_song_url = null;
			updateData.profile_song_title = null;
		} else if (songAction === 'upload') {
			const songFile = formData.get('profile_song_file') as File | null;
			if (!songFile) {
				return json({ error: 'No song file provided' }, { status: 400 });
			}
			if (songFile.size > PROFILE_SONG_MAX_BYTES) {
				return json({ error: 'Profile song must be 25MB or smaller' }, { status: 400 });
			}
			const ext = (songFile.name.split('.').pop() || '').toLowerCase();
			const contentType = SONG_EXT_CONTENT_TYPE[ext];
			if (!contentType) {
				return json({ error: 'Upload an MP3, OGG, WAV, M4A, or WEBA file' }, { status: 400 });
			}

			const buffer = Buffer.from(await songFile.arrayBuffer());
			const songKey = `${userId}_profile_song.${ext}`;

			await deleteOldUploadedSong();
			await minioClient.putObject(
				process.env.S3_BUCKET_NAME!,
				songKey,
				buffer,
				buffer.length,
				{ 'Content-Type': contentType }
			);

			updateData.profile_song_type = 'upload';
			updateData.profile_song_url = songKey;
			updateData.profile_song_title = songFile.name.slice(0, 100);
		} else if (songAction === 'youtube') {
			const youtubeUrl = (formData.get('profile_song_youtube_url') as string | null) ?? '';
			const videoId = parseYoutubeId(youtubeUrl);
			if (!videoId) {
				return json({ error: 'That doesn\'t look like a valid YouTube link' }, { status: 400 });
			}

			let title: string | null = null;
			try {
				const oembedRes = await fetch(
					`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
				);
				if (oembedRes.ok) title = ((await oembedRes.json()).title ?? null)?.slice(0, 100) ?? null;
			} catch {
				// Best-effort only — a missing title doesn't block setting the song.
			}

			await deleteOldUploadedSong();
			updateData.profile_song_type = 'youtube';
			updateData.profile_song_url = videoId;
			updateData.profile_song_title = title;
		}

		const songVolumeRaw = formData.get('profile_song_volume') as string | null;
		if (songVolumeRaw !== null) {
			const vol = Math.round(Number(songVolumeRaw));
			if (Number.isNaN(vol) || vol < 0 || vol > 100) {
				return json({ error: 'Volume must be between 0 and 100' }, { status: 400 });
			}
			updateData.profile_song_volume = vol;
		}

		const songLoopRaw = formData.get('profile_song_loop') as string | null;
		if (songLoopRaw !== null) {
			updateData.profile_song_loop = songLoopRaw === 'true';
		}
	} else {
		// Legacy path — plain JSON body (bio + username only, no banner)
		const body = await request.json();
		const { bio, username, rugplay_username, rugplay_enhancements_enabled, rugplay_api_key, name_color } = body;

		if (bio) {
			if (typeof bio !== 'string' || bio.length > 256) {
				return json({ error: 'Bio must be a string of 256 characters or less' }, { status: 400 });
			}
			updateData.bio = bio;
		}
		if (username) {
			if (typeof username !== 'string' || username.length > 60) {
				return json({ error: 'Username must be a string of 60 characters or less' }, { status: 400 });
			}
			updateData.username = username;
		}
		if (rugplay_username !== undefined) {
			if (typeof rugplay_username !== 'string' && rugplay_username !== null) {
				return json({ error: 'Rugplay username must be a string' }, { status: 400 });
			}
			updateData.rugplay_username = sanitizeRugplayUsername(rugplay_username ?? '');
		}

		if (name_color !== undefined) {
			if (name_color !== null && !isVerified) {
				return json({ error: 'Get verified to unlock name colors' }, { status: 403 });
			}
			if (!isValidNameColor(name_color)) {
				return json({ error: 'Invalid name color' }, { status: 400 });
			}
			updateData.name_color = name_color;
		}

		const enhErr = await applyRugplayEnhancementFields(
			updateData,
			typeof rugplay_enhancements_enabled === 'boolean' ? rugplay_enhancements_enabled : undefined,
			typeof rugplay_api_key === 'string' ? rugplay_api_key : undefined
		);
		if (enhErr) return json({ error: enhErr }, { status: 400 });

		// ── Email notifications ───────────────────────────────────────────
		const { email_notifications_enabled, notification_email } = body;

		if (email_notifications_enabled !== undefined) {
			updateData.email_notifications_enabled = Boolean(email_notifications_enabled);
		}

		if (notification_email !== undefined) {
			if (notification_email === null || notification_email === '') {
				updateData.notification_email = null;
			} else {
				// Basic RFC-ish email validation — Resend will reject garbage anyway
				const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (typeof notification_email !== 'string' || !emailRe.test(notification_email)) {
					return json({ error: 'That doesn\'t look like a valid email address' }, { status: 400 });
				}
				updateData.notification_email = notification_email.trim().toLowerCase().slice(0, 254);
			}
		}
	}

	if (Object.keys(updateData).length === 0) {
		return json({ message: 'No updates provided' }, { status: 400 });
	}

	try {
		const [updatedUser] = await db
			.update(users)
			.set(updateData)
			.where(eq(users.id, userId))
			.returning();

		return json(
			{
				message: 'User updated successfully',
				user: {
					id: updatedUser.id,
					handle: updatedUser.handle,
					username: updatedUser.username,
					bio: updatedUser.bio,
					banner: updatedUser.banner,  // NEW
					name_color: updatedUser.name_color,
					profile_song_type: updatedUser.profile_song_type,
					profile_song_url: updatedUser.profile_song_url,
					profile_song_title: updatedUser.profile_song_title,
					profile_song_volume: updatedUser.profile_song_volume,
					profile_song_loop: updatedUser.profile_song_loop,
					rugplay_username: updatedUser.rugplay_username,
					rugplay_enhancements_enabled: updatedUser.rugplay_enhancements_enabled,
					rugplay_key_valid: updatedUser.rugplay_key_valid,
					rugplay_key_set: !!updatedUser.rugplay_api_key_enc,
					email_notifications_enabled: updatedUser.email_notifications_enabled,
					// notification_email intentionally omitted — treated like rugplay_api_key_enc
				}
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error updating user:', error);
		return json({ error: 'Failed to update user' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const { success } = await sensitiveRatelimit.limit(
		request.headers.get('CF-Connecting-IP') ?? '127.0.0.1'
	);
	if (!success) {
		return json({ error: 'You are being ratelimited.' }, { status: 429 });
	}

	const authToken = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!authToken) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let userId;
	try {
		const decodedToken = await verifyAuthJWT(authToken);
		userId = decodedToken.userId;
	} catch (error) {
		return json({ error: 'Invalid token' }, { status: 401 });
	}

	let body: any = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const cfIp = request.headers.get('CF-Connecting-IP') ?? undefined;
	const turnstileOk = await verifyTurnstile(body.turnstileToken ?? '', cfIp);
	if (!turnstileOk) {
		return json({ error: 'CAPTCHA verification failed. Please try again.' }, { status: 400 });
	}

	const [currentUser] = await db
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!currentUser) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	if (typeof body.confirmUsername !== 'string' || body.confirmUsername !== currentUser.username) {
		return json({ error: 'Typed username does not match. Account was not deleted.' }, { status: 400 });
	}

	try {
		// Start a transaction
		await db.transaction(async (tx) => {
			// Delete notifications
			console.log('Account deletion - ' + userId);
			console.time('Getting all lynts');
			const userLynts = await tx
				.select({ id: lynts.id })
				.from(lynts)
				.where(eq(lynts.user_id, userId));
			console.timeEnd('Getting all lynts');
			console.time('Deleting all lynts');
			for (const lynt of userLynts) {
				await deleteLynt(lynt.id);
			}
			console.timeEnd('Deleting all lynts');
			console.time('Deleting all notifications');
			await tx.delete(notifications).where(eq(notifications.userId, userId));
			await tx.delete(notifications).where(eq(notifications.sourceUserId, userId));
			console.timeEnd('Deleting all notifications');
			console.time('Deleting all history');
			await tx.delete(history).where(eq(history.user_id, userId));
			console.timeEnd('Deleting all history');
			console.time('Deleting all followers/following');
			await tx.delete(followers).where(eq(followers.user_id, userId));
			await tx.delete(followers).where(eq(followers.follower_id, userId));
			console.timeEnd('Deleting all followers/following');

			console.time('Deleting all remaining likes');
			await tx.delete(likes).where(eq(likes.user_id, userId));
			console.timeEnd('Deleting all remaining likes');
			console.time('Deleting all achievements');
			await tx.delete(userAchievements).where(eq(userAchievements.user_id, userId));
			console.timeEnd('Deleting all achievements');

			console.time('Deleting all bookmarks');
			await tx.delete(bookmarks).where(eq(bookmarks.user_id, userId));
			console.timeEnd('Deleting all bookmarks');

			console.time('Deleting all forum votes');
			await tx.delete(forumPostVotes).where(eq(forumPostVotes.user_id, userId));
			console.timeEnd('Deleting all forum votes');

			console.time('Deleting all LyntCoins ledger rows');
			await tx.delete(lcTransactions).where(or(eq(lcTransactions.user_id, userId), eq(lcTransactions.source_user_id, userId)));
			console.timeEnd('Deleting all LyntCoins ledger rows');

			console.time('Detaching forum threads/posts from user');
			await tx.update(forumThreads).set({ user_id: null }).where(eq(forumThreads.user_id, userId));
			await tx.update(forumThreads).set({ closed_by: null }).where(eq(forumThreads.closed_by, userId));
			await tx.update(forumPosts).set({ user_id: null }).where(eq(forumPosts.user_id, userId));
			await tx.update(forumPosts).set({ deleted_by: null }).where(eq(forumPosts.deleted_by, userId));
			console.timeEnd('Detaching forum threads/posts from user');

			// Finally, delete the user
			console.time('Deleting user');
			let deletedUser;
			try {
				deletedUser = await tx.delete(users).where(eq(users.id, userId)).returning();
			} finally {
				console.timeEnd('Deleting user');
			}

			if (deletedUser.length === 0) {
				throw new Error('User not found');
			}
		});

		// Clear the auth cookie
		cookies.delete('_TOKEN__DO_NOT_SHARE', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 31536000 // 1 year
		});

		cookies.delete('temp-discord-token', { path: '/' });
		cookies.delete('temp-google-token', { path: '/' });
		cookies.delete('temp-google-user', { path: '/' });

		return json({ message: 'User and all related data deleted successfully' }, { status: 200 });
	} catch (error) {
		console.error('Error deleting user:', error);
		return json({ error: 'Failed to delete user and related data' }, { status: 500 });
	}
};

function santize(input: string) {
	return input.toLowerCase().replace(/\s/g, '');
}

function sanitizeNum(input: string) {
	let num = parseInt(input);

	if (num < 0) num = 0;

	return num;
}

function sanitizeBool(input: string) {
	return input === 'true'
}

function sanitizeRugplayUsername(input: string): string | null {
	const cleaned = input.trim().replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 60);
	return cleaned.length > 0 ? cleaned : null;
}
