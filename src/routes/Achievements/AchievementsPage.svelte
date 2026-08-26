<script lang="ts">
	// ── Achievements page ────────────────────────────────────────
	// Full catalog (locked + unlocked) with an overall progress bar.
	// Mounting this page marks any unseen unlocks as seen (PATCH
	// /api/achievements/unseen) — same "walking in resets the badge"
	// pattern as Notifications/Messages use, just for achievements
	// instead, and it's what clears the gold nav badge.
	//
	// Unlocking an achievement doesn't auto-pay its Community XP bonus —
	// each unlocked card shows a Claim button (POST /api/achievements/claim)
	// so collecting the reward is an active, satisfying step instead of
	// something that just silently happens in the background.
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { Progress } from '@/components/ui/progress';
	import { Badge } from '@/components/ui/badge';
	import { Button } from '@/components/ui/button';
	import { tierColor, type AchievementTier } from '$lib/achievements';
	import { unseenAchievements } from '../stores';

	interface AchievementRow {
		key: string;
		name: string;
		description: string;
		tier: AchievementTier;
		coinReward: number;
		icon: string;
		unlocked: boolean;
		unlockedAt: string | null;
		seenAt: string | null;
		claimedAt: string | null;
	}

	let achievements: AchievementRow[] = $state([]);
	let unlockedCount = $state(0);
	let totalCount = $state(0);
	let loading = $state(true);
	let claiming = $state<Set<string>>(new Set());

	async function load() {
		loading = true;
		const response = await fetch('/api/achievements');
		if (response.ok) {
			const data = await response.json();
			achievements = data.achievements;
			unlockedCount = data.unlockedCount;
			totalCount = data.totalCount;
		} else {
			toast.error('Failed to load achievements.');
		}
		loading = false;
	}

	async function claim(achievement: AchievementRow) {
		if (claiming.has(achievement.key)) return;
		claiming = new Set(claiming).add(achievement.key);

		try {
			const response = await fetch('/api/achievements/claim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: achievement.key })
			});

			if (response.ok) {
				// Optimistic-ish: just patch the one row rather than a full
				// refetch — the Coin Pop toast (fired server-side over WS)
				// handles showing the actual +XP pickup.
				achievements = achievements.map((a) =>
					a.key === achievement.key ? { ...a, claimedAt: new Date().toISOString() } : a
				);
			} else {
				const err = await response.json().catch(() => ({ error: 'claim_failed' }));
				if (err.error === 'already_claimed') {
					toast.error('Already claimed.');
					achievements = achievements.map((a) =>
						a.key === achievement.key ? { ...a, claimedAt: a.claimedAt ?? new Date().toISOString() } : a
					);
				} else {
					toast.error('Failed to claim achievement.');
				}
			}
		} catch {
			toast.error('Failed to claim achievement.');
		} finally {
			const next = new Set(claiming);
			next.delete(achievement.key);
			claiming = next;
		}
	}

	onMount(async () => {
		await load();
		// Clears the gold badge — mirrors Notifications.svelte's PATCH call
		// on mount. Also zero out the shared store immediately so the nav
		// badge disappears without waiting on a refetch.
		fetch('/api/achievements/unseen', { method: 'PATCH' }).catch(() => {});
		$unseenAchievements = 0;
	});

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// Sort: unclaimed-unlocked first (needs action), then claimed
	// (most recent unlock first), then locked.
	let sorted = $derived(
		[...achievements].sort((a, b) => {
			const rank = (x: AchievementRow) => (x.unlocked && !x.claimedAt ? 0 : x.unlocked ? 1 : 2);
			const rankDiff = rank(a) - rank(b);
			if (rankDiff !== 0) return rankDiff;
			if (a.unlocked && b.unlocked) {
				return new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime();
			}
			return 0;
		})
	);
</script>

<div class="flex h-full w-full flex-col overflow-y-auto px-1 pb-6">
	<div class="sticky top-0 z-10 bg-background/95 pb-3 pt-2 backdrop-blur">
		<h1 class="text-xl font-bold">Achievements</h1>
		<p class="text-muted-foreground text-sm">
			Milestones for using Lyntr. Each one has a one-time Community XP bonus to claim once unlocked.
		</p>

		{#if !loading}
			<div class="mt-3 flex items-center gap-3">
				<Progress value={unlockedCount} max={totalCount} class="h-3 flex-1" />
				<span class="text-muted-foreground whitespace-nowrap text-sm font-medium">
					{unlockedCount}/{totalCount}
				</span>
			</div>
		{/if}
	</div>

	{#if loading}
		<LoadingSpinner />
	{:else}
		<div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each sorted as achievement (achievement.key)}
				{@const claimable = achievement.unlocked && !achievement.claimedAt}
				<div
					class="flex items-center gap-3 rounded-[6px] border-t-[2px] border-l-[2px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[2px] border-r-[2px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-3 transition-opacity"
					class:opacity-50={!achievement.unlocked}
					style={`border-color: ${achievement.unlocked ? tierColor(achievement.tier) : 'hsl(var(--border))'}; background: ${achievement.unlocked ? tierColor(achievement.tier) + '14' : 'transparent'};`}
				>
					<div
						class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2"
						style={`border-color: ${achievement.unlocked ? tierColor(achievement.tier) : 'hsl(var(--border))'}; background: ${achievement.unlocked ? tierColor(achievement.tier) + '22' : 'hsl(var(--muted))'};`}
					>
						<img
							src={`/achievements/${achievement.icon}`}
							alt={achievement.name}
							class={`h-7 w-7 object-contain ${achievement.unlocked ? '' : 'grayscale'}`}
						/>
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="font-bold">{achievement.name}</span>
							<Badge
								variant="outline"
								class="rounded-md text-[10px] capitalize"
								style={`border-color: ${tierColor(achievement.tier)}; color: ${tierColor(achievement.tier)};`}
							>
								{achievement.tier}
							</Badge>
							{#if achievement.unlocked && !achievement.seenAt}
								<Badge class="rounded-md bg-amber-500 text-[10px] text-black hover:bg-amber-500">NEW</Badge>
							{/if}
						</div>
						<p class="text-muted-foreground text-sm">{achievement.description}</p>
						<div class="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
							{#if achievement.unlocked}
								<span>· Unlocked {formatDate(achievement.unlockedAt)}</span>
							{:else}
								<span>+{achievement.coinReward.toLocaleString()} XP · Locked</span>
							{/if}
						</div>
					</div>
					{#if claimable}
						<Button
							size="sm"
							class="flex-shrink-0 gap-1"
							onclick={() => claim(achievement)}
							disabled={claiming.has(achievement.key)}
						>
							Claim +{achievement.coinReward.toLocaleString()}
						</Button>
					{:else if achievement.unlocked}
						<Badge variant="outline" class="flex-shrink-0 gap-1 text-xs">
							Claimed
						</Badge>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
