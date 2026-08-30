<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { Badge } from '@/components/ui/badge';
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
	<div class="sticky top-0 z-10 pb-3 pt-2">
		<div class="achievements-header">
			<h1>Achievements</h1>
			<p>Milestones for using Lyntr. Each one has a one-time Community XP bonus to claim once unlocked.</p>

			{#if !loading}
				<div class="mt-3 flex items-center gap-3">
					<div class="retro-progress-track">
						<div
							class="retro-progress-fill"
							style="width: {totalCount ? (unlockedCount / totalCount) * 100 : 0}%"
						></div>
					</div>
					<span class="progress-count">{unlockedCount}/{totalCount}</span>
				</div>
			{/if}
		</div>
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
							<span class="font-bold font-[family-name:var(--font-retro)]">{achievement.name}</span>
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
						<button
							class="claim-btn flex-shrink-0"
							onclick={() => claim(achievement)}
							disabled={claiming.has(achievement.key)}
						>
							Claim +{achievement.coinReward.toLocaleString()}
						</button>
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

<style>
	.achievements-header {
		padding: 12px 16px;
		border-radius: var(--radius-md);
		background: var(--header-bg);
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
	}
	.achievements-header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-family: var(--font-retro);
	}
	.achievements-header p {
		margin: 4px 0 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-family: var(--font-retro);
	}

	/* Retro inset trough + gloss fill bar, matching the IQ badge / "new
	   posts" pill treatment elsewhere, instead of shadcn's flat Progress. */
	.retro-progress-track {
		flex: 1;
		height: 12px;
		border-radius: 999px;
		background: hsl(var(--input));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
		overflow: hidden;
	}
	.retro-progress-fill {
		height: 100%;
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		border-radius: inherit;
		transition: width 0.3s ease;
	}
	.progress-count {
		white-space: nowrap;
		font-size: 0.8125rem;
		font-weight: 600;
		font-family: var(--font-retro);
		color: hsl(var(--muted-foreground));
	}

	/* Claim button — same gloss/bevel pill as the rest of Lyntr's primary
	   actions, instead of shadcn's flat default Button. */
	.claim-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border-radius: 6px;
		font-family: var(--font-retro);
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--primary-foreground));
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		cursor: pointer;
		transition: filter 0.12s;
	}
	.claim-btn:hover:not(:disabled) { filter: brightness(1.08); }
	.claim-btn:disabled { opacity: 0.6; cursor: default; }
</style>
