// src/lib/server/profile.ts
// profile lookup thing used by the dekstop app for accurate data communication

import { db } from '@/server/db';
import { followers, users, userAchievements } from '@/server/schema';
import { sql } from 'drizzle-orm';

export interface PublicProfileLookup {
	handle?: string | null;
	id?: string | null;
	viewerId?: string | null;
}

export async function getPublicProfile({ handle, id, viewerId }: PublicProfileLookup) {
	if (!handle && !id) return { error: 'Missing user handle or id.' as const, status: 400 as const };

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
			u.status_text,
			u.status_expires_at,
			u.timezone_label,
			u.timezone_offset,
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
		WHERE ${handle ? sql`u.handle = ${handle}` : sql`u.id = ${id}`} AND u.banned = false
		LIMIT 1
	`;

	const achievementsQuery = sql`
		SELECT ua.achievement_key, ua.unlocked_at
		FROM ${userAchievements} ua
		JOIN ${users} u ON u.id = ua.user_id
		WHERE ${handle ? sql`u.handle = ${handle}` : sql`u.id = ${id}`} AND u.banned = false
	`;

	const [result, achievementRows] = await Promise.all([
		db.execute(query),
		db.execute(achievementsQuery)
	]);
	const user = result[0] as any;

	if (!user) return { error: 'User not found' as const, status: 404 as const };

	return {
		profile: {
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
			status_text:
				user.status_expires_at && new Date(String(user.status_expires_at)).getTime() <= Date.now()
					? null
					: (user.status_text ?? null),
			status_expires_at:
				user.status_expires_at && new Date(String(user.status_expires_at)).getTime() <= Date.now()
					? null
					: (user.status_expires_at ?? null),
			timezone_label: user.timezone_label ?? null,
			timezone_offset: user.timezone_offset ?? null,
			achievements: achievementRows.map((a: any) => ({
				key: a.achievement_key,
				unlocked_at: a.unlocked_at
			})),
			rugplay_username: user.rugplay_username ?? null,
			rugplay_enhancements_enabled: user.rugplay_enhancements_enabled ?? false,
			rugplay_key_valid: user.rugplay_key_valid ?? false,
			rugplay_key_set: user.rugplay_key_set ?? false,
			email_notifications_enabled: user.email_notifications_enabled ?? false,
			notification_email_set: user.notification_email_set ?? false,
			viewer_follows: user.viewer_follows ?? false
		},
		status: 200 as const
	};
}