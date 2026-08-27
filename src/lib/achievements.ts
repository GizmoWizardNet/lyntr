/**
 * src/lib/achievements.ts — the achievement catalog.
 *
 * Pure data, no DB access — safe to import from both server code
 * (src/lib/server/achievements.ts, which does the actual unlock-checking
 * against the DB) and client code (profile UI, rendering badges — unlocked
 * or not — from this same list). Adding a new achievement is a code change
 * here, not a migration, since unlocks are just (user_id, achievement_key)
 * rows keyed against whatever's defined below.
 *
 * IMPORTANT: existing `key` values are never renamed or removed, even when
 * restructuring — someone may have already unlocked/claimed a row under
 * that exact key, and renaming it would orphan their unlock (and could
 * cause it to silently re-trigger as "new" under a different key). New
 * tiers/achievements are always additive.
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementDef {
	key: string;
	name: string;
	description: string;
	tier: AchievementTier;
	/** Community XP paid out on unlock. Bypasses the daily earn cap — a
	 *  milestone reward shouldn't get silently swallowed by the cap. */
	coinReward: number;
	/** Filename of a static icon under /static/achievements/ (referenced
	 *  client-side as `/achievements/${icon}`). Tiered achievements within
	 *  the same family reuse one icon — the tier ring/level number is what
	 *  distinguishes them, not a separate piece of art per level. */
	icon: string;
	/** Groups tiered achievements into one ladder on the Achievements page
	 *  (e.g. "yapper" → I/II/III). Omit for standalone, one-shot
	 *  achievements like First Lynt. */
	family?: string;
	/** 1/2/3 — position within `family`'s ladder. Ignored if no family. */
	level?: number;
	/** Secret achievements show as "???" (name/description hidden, no
	 *  real icon) until unlocked — for surprise/discovery value. Still
	 *  counts toward totals and Achievement Hunter, just not spoiled. */
	secret?: boolean;
}

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
	{
		key: 'first_lynt',
		name: 'First Lynt',
		description: 'Posted your first lynt.',
		tier: 'bronze',
		coinReward: 25,
		icon: 'first_lynt.png'
	},

	// ── Yapper (post count) ─────────────────────────────────────────
	{
		key: 'yapper_10',
		name: 'Yapper I',
		description: 'Posted 10 lynts.',
		tier: 'bronze',
		coinReward: 25,
		icon: 'yapper_100.png',
		family: 'yapper',
		level: 1
	},
	{
		key: 'yapper_100',
		name: 'Yapper II',
		description: 'Posted 100 lynts.',
		tier: 'silver',
		coinReward: 100,
		icon: 'yapper_100.png',
		family: 'yapper',
		level: 2
	},
	{
		key: 'yapper_500',
		name: 'Yapper III',
		description: 'Posted 500 lynts.',
		tier: 'gold',
		coinReward: 300,
		icon: 'yapper_100.png',
		family: 'yapper',
		level: 3
	},

	// ── Login streak ──────────────────────────────────────────────
	{
		key: 'streak_7',
		name: 'Login Streak I',
		description: 'Reached a 7-day login streak.',
		tier: 'bronze',
		coinReward: 50,
		icon: 'streak_7.png',
		family: 'streak',
		level: 1
	},
	{
		key: 'streak_30',
		name: 'Login Streak II',
		description: 'Reached a 30-day login streak.',
		tier: 'silver',
		coinReward: 200,
		icon: 'streak_7.png',
		family: 'streak',
		level: 2
	},
	{
		key: 'streak_100',
		name: 'Login Streak III',
		description: 'Reached a 100-day login streak.',
		tier: 'gold',
		coinReward: 500,
		icon: 'streak_7.png',
		family: 'streak',
		level: 3
	},

	// ── Followers ─────────────────────────────────────────────────
	{
		key: 'followers_20',
		name: 'Followers I',
		description: 'Reached 20 followers.',
		tier: 'bronze',
		coinReward: 75,
		icon: 'follower_20.png',
		family: 'followers',
		level: 1
	},
	{
		key: 'followers_50',
		name: 'Followers II',
		description: 'Reached 50 followers.',
		tier: 'silver',
		coinReward: 300,
		icon: 'follower_50.png',
		family: 'followers',
		level: 2
	},
	{
		key: 'followers_100',
		name: 'Followers III',
		description: 'Reached 100 followers.',
		tier: 'gold',
		coinReward: 750,
		icon: 'follower_50.png',
		family: 'followers',
		level: 3
	},

	// ── IQ ────────────────────────────────────────────────────────
	{
		key: 'big_brain',
		name: 'Big Brain I',
		description: 'Verified IQ of 130 or higher.',
		tier: 'bronze',
		coinReward: 50,
		icon: 'big_brain.png',
		family: 'big_brain',
		level: 1
	},
	{
		key: 'big_brain_2',
		name: 'Big Brain II',
		description: 'Verified IQ of 145 or higher.',
		tier: 'silver',
		coinReward: 150,
		icon: 'big_brain.png',
		family: 'big_brain',
		level: 2
	},
	{
		key: 'big_brain_3',
		name: 'Big Brain III',
		description: 'Verified IQ of 160 or higher.',
		tier: 'gold',
		coinReward: 400,
		icon: 'big_brain.png',
		family: 'big_brain',
		level: 3
	},

	// ── Forum ─────────────────────────────────────────────────────
	{
		key: 'forum_regular',
		name: 'Forum I',
		description: 'Made 10 posts on the forum.',
		tier: 'bronze',
		coinReward: 75,
		icon: 'forum_regular.png',
		family: 'forum',
		level: 1
	},
	{
		key: 'forum_veteran',
		name: 'Forum II',
		description: 'Made 50 posts on the forum.',
		tier: 'silver',
		coinReward: 200,
		icon: 'forum_regular.png',
		family: 'forum',
		level: 2
	},
	{
		key: 'forum_legend',
		name: 'Forum III',
		description: 'Made 200 posts on the forum.',
		tier: 'gold',
		coinReward: 500,
		icon: 'forum_regular.png',
		family: 'forum',
		level: 3
	},

	// ── Community XP ──────────────────────────────────────────────
	{
		key: 'xp_hoarder',
		name: 'XP Hoarder I',
		description: 'Earned 2,500 lifetime Community XP.',
		tier: 'bronze',
		coinReward: 100,
		icon: 'xp_hoarder.png',
		family: 'xp_hoarder',
		level: 1
	},
	{
		key: 'xp_hoarder_2',
		name: 'XP Hoarder II',
		description: 'Earned 10,000 lifetime Community XP.',
		tier: 'silver',
		coinReward: 300,
		icon: 'xp_hoarder.png',
		family: 'xp_hoarder',
		level: 2
	},
	{
		key: 'xp_hoarder_3',
		name: 'XP Hoarder III',
		description: 'Earned 50,000 lifetime Community XP.',
		tier: 'gold',
		coinReward: 1000,
		icon: 'xp_hoarder.png',
		family: 'xp_hoarder',
		level: 3
	},

	// ── Achievement Hunter (meta) ─────────────────────────────────
	{
		key: 'achievement_hunter',
		name: 'Achievement Hunter I',
		description: 'Unlocked 5 other achievements.',
		tier: 'bronze',
		coinReward: 150,
		icon: 'achievement_hunter.png',
		family: 'hunter',
		level: 1
	},
	{
		key: 'achievement_hunter_2',
		name: 'Achievement Hunter II',
		description: 'Unlocked 15 other achievements.',
		tier: 'silver',
		coinReward: 400,
		icon: 'achievement_hunter.png',
		family: 'hunter',
		level: 2
	},
	{
		key: 'achievement_hunter_3',
		name: 'Achievement Hunter III',
		description: 'Unlocked 25 other achievements.',
		tier: 'gold',
		coinReward: 1000,
		icon: 'achievement_hunter.png',
		family: 'hunter',
		level: 3
	},

	// ── Standalone (one-shot, not part of a ladder) ────────────────
	{
		key: 'first_dm',
		name: 'Slid Into the DMs',
		description: 'Sent your first direct message.',
		tier: 'bronze',
		coinReward: 25,
		icon: 'first_dm.png'
	},
	{
		key: 'first_poll',
		name: 'Pollster',
		description: 'Created your first poll.',
		tier: 'bronze',
		coinReward: 25,
		icon: 'first_poll.png'
	},
	{
		key: 'first_repost',
		name: 'Amplifier',
		description: "Reposted someone else's lynt.",
		tier: 'bronze',
		coinReward: 25,
		icon: 'first_repost.png'
	},
	{
		key: 'rugplay_linked',
		name: 'Diversified',
		description: 'Linked a Rugplay account.',
		tier: 'bronze',
		coinReward: 50,
		icon: 'rugplay_linked.png'
	},

	// ── Secret ────────────────────────────────────────────────────
	// Name/description/icon are hidden client-side until unlocked — see
	// ACHIEVEMENT_BY_KEY consumers in the Achievements page for how the
	// "???" state is rendered. Still counts toward totals/Hunter tiers.
	{
		key: 'night_owl',
		name: 'Night Owl',
		description: 'Posted a lynt between 2 and 4 AM.',
		tier: 'silver',
		coinReward: 100,
		icon: 'night_owl.png',
		secret: true
	},
	{
		key: 'quick_edit',
		name: 'Second Thoughts',
		description: 'Edited a lynt within 10 seconds of posting it.',
		tier: 'silver',
		coinReward: 100,
		icon: 'quick_edit.png',
		secret: true
	}
];

export const ACHIEVEMENT_BY_KEY: Record<string, AchievementDef> = Object.fromEntries(
	ACHIEVEMENT_CATALOG.map((a) => [a.key, a])
);

export function tierColor(tier: AchievementTier): string {
	if (tier === 'gold') return '#d9a017';
	if (tier === 'silver') return '#9ca3af';
	return '#b8804f';
}
