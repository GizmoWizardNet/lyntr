import { writable, get } from 'svelte/store';

export type LeaderboardCategoryKey = 'iq' | 'followers' | 'forum' | 'networth' | 'achievements';

export const CATEGORY_META: Record<LeaderboardCategoryKey, { label: string; short: string }> = {
	iq: { label: 'IQ Score', short: 'IQ' },
	followers: { label: 'Followers', short: 'Followers' },
	forum: { label: 'Forum Reputation', short: 'Forum rep' },
	networth: { label: 'Net Worth (Rugplay)', short: 'Net worth' },
	achievements: { label: 'Achievements', short: 'Achievements' }
};

export const CATEGORY_ORDER: LeaderboardCategoryKey[] = ['iq', 'followers', 'forum', 'networth', 'achievements'];

export interface Top3Entry {
	userId: string;
	handle: string;
	username: string;
	value: number;
	rank: number;
}

export type Top3Map = Record<LeaderboardCategoryKey, Top3Entry[]>;

export const top3 = writable<Top3Map | null>(null);

let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;
const REFRESH_MS = 2 * 60 * 1000; // badges are "live" but no need to hammer the endpoint

export async function ensureTop3Loaded(force = false) {
	if (!force && Date.now() - lastFetchedAt < REFRESH_MS && get(top3) !== null) return;
	if (inFlight) return inFlight;

	inFlight = (async () => {
		try {
			const response = await fetch('/api/leaderboard/top3');
			if (response.ok) {
				top3.set(await response.json());
				lastFetchedAt = Date.now();
			}
		} catch {
			// badges are decorative — fail silently and just show none
		} finally {
			inFlight = null;
		}
	})();

	return inFlight;
}

export function badgesForHandle(map: Top3Map | null, handle: string): { category: LeaderboardCategoryKey; rank: number }[] {
	if (!map || !handle) return [];
	const out: { category: LeaderboardCategoryKey; rank: number }[] = [];
	for (const category of CATEGORY_ORDER) {
		const entry = map[category]?.find((e) => e.handle === handle);
		if (entry) out.push({ category, rank: entry.rank });
	}
	return out;
}
