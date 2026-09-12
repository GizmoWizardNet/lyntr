<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { Badge } from '@/components/ui/badge';
	import { tierColor, type AchievementTier } from '$lib/achievements';
	import { unseenAchievements } from '../stores';
	import { celebrateAchievementClaim } from '$lib/achievementCelebration';

	interface AchievementRow {
		key: string;
		name: string;
		description: string;
		tier: AchievementTier;
		coinReward: number;
		icon: string;
		family?: string;
		unlocked: boolean;
		unlockedAt: string | null;
		seenAt: string | null;
		claimedAt: string | null;
	}

	const CATEGORY_ORDER = ['posting', 'social', 'community', 'mastery', 'secret', 'milestones'] as const;
	type CategoryKey = (typeof CATEGORY_ORDER)[number];

	const CATEGORY_LABELS: Record<CategoryKey, string> = {
		posting: 'Posting',
		social: 'Social',
		community: 'Community',
		mastery: 'Mastery',
		secret: 'Secret',
		milestones: 'Milestones'
	};

	const CATEGORY_BY_FAMILY_OR_KEY: Record<string, CategoryKey> = {
		yapper: 'posting',
		streak: 'posting',
		first_lynt: 'posting',
		followers: 'social',
		first_dm: 'social',
		first_repost: 'social',
		first_poll: 'social',
		rugplay_linked: 'social',
		forum: 'community',
		big_brain: 'mastery',
		xp_hoarder: 'mastery',
		hunter: 'mastery',
		night_owl: 'secret',
		quick_edit: 'secret'
	};

	function categoryOf(a: AchievementRow): CategoryKey {
		return CATEGORY_BY_FAMILY_OR_KEY[a.family ?? a.key] ?? 'milestones';
	}

	type SortMode = 'progress' | 'tier' | 'alpha';
	const SORT_LABELS: Record<SortMode, string> = {
		progress: 'Unlocked first',
		tier: 'Tier',
		alpha: 'A–Z'
	};

	function tierRank(tier: AchievementTier): number {
		return tier === 'gold' ? 0 : tier === 'silver' ? 1 : 2;
	}

	let activeCategory = $state<CategoryKey | 'all'>('all');
	let sortMode = $state<SortMode>('progress');

	function sortByMode(items: AchievementRow[], mode: SortMode): AchievementRow[] {
		const withIndex = items.map((a, i) => ({ a, i }));
		withIndex.sort((x, y) => {
			if (mode === 'alpha') return x.a.name.localeCompare(y.a.name);
			if (mode === 'tier') {
				const diff = tierRank(x.a.tier) - tierRank(y.a.tier);
				return diff !== 0 ? diff : x.i - y.i;
			}
			// 'progress': unlocked/claimed before locked, otherwise leave
			// catalog order (i.e. family ladders) intact.
			const rank = (r: AchievementRow) => (r.unlocked ? 0 : 1);
			const diff = rank(x.a) - rank(y.a);
			return diff !== 0 ? diff : x.i - y.i;
		});
		return withIndex.map((w) => w.a);
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
				achievements = achievements.map((a) =>
					a.key === achievement.key ? { ...a, claimedAt: new Date().toISOString() } : a
				);
				celebrateAchievementClaim();
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
		fetch('/api/achievements/unseen', { method: 'PATCH' }).catch(() => {});
		$unseenAchievements = 0;
	});

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	let claimable = $derived(
		sortByMode(
			achievements.filter(
				(a) => a.unlocked && !a.claimedAt && (activeCategory === 'all' || categoryOf(a) === activeCategory)
			),
			sortMode
		)
	);

	let availableCategories = $derived.by(() => {
		const present = new Set(achievements.map((a) => categoryOf(a)));
		return CATEGORY_ORDER.filter((cat) => present.has(cat));
	});

	let categories = $derived.by(() => {
		const rest = achievements.filter((a) => !(a.unlocked && !a.claimedAt));
		const groups = new Map<CategoryKey, AchievementRow[]>();
		for (const a of rest) {
			const cat = categoryOf(a);
			if (activeCategory !== 'all' && cat !== activeCategory) continue;
			if (!groups.has(cat)) groups.set(cat, []);
			groups.get(cat)!.push(a);
		}
		return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => ({
			key: cat,
			label: CATEGORY_LABELS[cat],
			items: sortByMode(groups.get(cat)!, sortMode)
		}));
	});
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
		<div class="mx-auto w-full max-w-[1100px]">
			<div class="controls-bar">
				<div class="filter-chips">
					<button class="chip" class:active={activeCategory === 'all'} onclick={() => (activeCategory = 'all')}>
						All
					</button>
					{#each availableCategories as cat (cat)}
						<button
							class="chip"
							class:active={activeCategory === cat}
							onclick={() => (activeCategory = cat)}
						>
							{CATEGORY_LABELS[cat]}
						</button>
					{/each}
				</div>
				<label class="sort-select-wrap">
					<span class="sort-label">Sort</span>
					<select class="sort-select" bind:value={sortMode}>
						{#each Object.entries(SORT_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if claimable.length > 0}
				<section class="mb-6">
					<h2 class="section-heading claim-heading">
						Ready to claim
						<span class="section-count">{claimable.length}</span>
					</h2>
					<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
						{#each claimable as achievement (achievement.key)}
							<div
								class="claim-card"
								style={`--tier-color: ${tierColor(achievement.tier)};`}
							>
								<img
									src={`/achievements/${achievement.icon}`}
									alt={achievement.name}
									class="achievement-icon achievement-icon-lg"
								/>
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
										{#if !achievement.seenAt}
											<Badge class="rounded-md bg-amber-500 text-[10px] text-black hover:bg-amber-500">NEW</Badge>
										{/if}
									</div>
									<p class="text-muted-foreground text-sm">{achievement.description}</p>
									<span class="text-muted-foreground text-xs">Unlocked {formatDate(achievement.unlockedAt)}</span>
								</div>
								<button
									class="claim-btn flex-shrink-0"
									onclick={() => claim(achievement)}
									disabled={claiming.has(achievement.key)}
								>
									Claim +{achievement.coinReward.toLocaleString()}
								</button>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#each categories as category (category.key)}
				<section class="mb-6">
					<h2 class="section-heading">{category.label}</h2>
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each category.items as achievement (achievement.key)}
							<div
								class="achievement-card"
								class:locked={!achievement.unlocked}
								style={`--tier-color: ${achievement.unlocked ? tierColor(achievement.tier) : 'hsl(var(--border))'};`}
							>
								{#if achievement.icon}
									<img
										src={`/achievements/${achievement.icon}`}
										alt={achievement.name}
										class={`achievement-icon ${achievement.unlocked ? '' : 'grayscale'}`}
									/>
								{:else}
									<div class="achievement-icon achievement-icon-placeholder">?</div>
								{/if}
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
									</div>
									<p class="text-muted-foreground text-sm">{achievement.description}</p>
									<div class="text-muted-foreground mt-1 text-xs">
										{#if achievement.unlocked}
											Unlocked {formatDate(achievement.unlockedAt)}
										{:else}
											+{achievement.coinReward.toLocaleString()} XP · Locked
										{/if}
									</div>
								</div>
								{#if achievement.unlocked}
									<Badge variant="outline" class="flex-shrink-0 gap-1 text-xs">Claimed</Badge>
								{/if}
							</div>
						{/each}
					</div>
				</section>
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

	.controls-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 12px 4px 18px;
	}
	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		padding: 5px 12px;
		border-radius: 999px;
		font-family: var(--font-retro);
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		cursor: pointer;
		transition:
			filter 0.12s,
			color 0.12s,
			background 0.12s;
	}
	.chip:hover {
		filter: brightness(1.08);
	}
	.chip.active {
		color: hsl(var(--primary-foreground));
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
	}
	.sort-select-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sort-label {
		font-family: var(--font-retro);
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	.sort-select {
		padding: 5px 10px;
		border-radius: 6px;
		font-family: var(--font-retro);
		font-size: 0.75rem;
		font-weight: 600;
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
		cursor: pointer;
	}

	.section-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 10px 4px;
		font-family: var(--font-retro);
		font-size: 0.9rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
	}
	.claim-heading {
		color: #d9a017;
	}
	.section-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: #d9a017;
		color: black;
		font-size: 0.6875rem;
		font-weight: 800;
	}

	.achievement-icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		object-fit: contain;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.25));
	}
	.achievement-icon-lg {
		width: 52px;
		height: 52px;
	}
	.achievement-icon-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-retro);
		font-weight: 700;
		font-size: 1.1rem;
		color: hsl(var(--muted-foreground));
	}

	.achievement-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: 6px;
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		border-color: var(--tier-color);
		background: color-mix(in srgb, var(--tier-color) 8%, transparent);
		box-shadow: var(--hard-shadow-sm);
	}
	.achievement-card.locked {
		opacity: 0.5;
		background: transparent;
	}

	.claim-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
		border-radius: 8px;
		border: 2px solid var(--tier-color);
		background: color-mix(in srgb, var(--tier-color) 14%, transparent);
		box-shadow:
			var(--hard-shadow),
			0 0 0 1px color-mix(in srgb, var(--tier-color) 40%, transparent);
		animation: claim-glow 2.2s ease-in-out infinite;
	}

	@keyframes claim-glow {
		0%,
		100% {
			box-shadow:
				var(--hard-shadow),
				0 0 0 1px color-mix(in srgb, var(--tier-color) 40%, transparent);
		}
		50% {
			box-shadow:
				var(--hard-shadow),
				0 0 14px 2px color-mix(in srgb, var(--tier-color) 55%, transparent);
		}
	}

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
	.claim-btn:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.claim-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	@media (prefers-reduced-motion: reduce) {
		.claim-card {
			animation: none;
		}
	}
</style>