<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Medal, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import Avatar from '../Avatar.svelte';
	import UserName from '../UserName.svelte';
	import { cdnUrl, currentPage } from '../stores';
	import TopTab from '../TopTab.svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { CATEGORY_META, CATEGORY_ORDER, type LeaderboardCategoryKey } from '../leaderboardStore';

	let category: LeaderboardCategoryKey = $state('iq');
	const tabs = CATEGORY_ORDER.map((c) => CATEGORY_META[c].short);
	const tabToCategory: Record<string, LeaderboardCategoryKey> = Object.fromEntries(
		CATEGORY_ORDER.map((c) => [CATEGORY_META[c].short, c])
	);

	let entries: any[] = $state([]);
	let loading = $state(true);
	const PAGE_SIZE = 10;
	let offset = $state(0);
	let hasMore = $state(false);

	async function load() {
		loading = true;
		try {
			const response = await fetch(`/api/leaderboard?category=${category}&limit=${PAGE_SIZE}&offset=${offset}`);
			if (response.ok) {
				const data = await response.json();
				entries = data.entries;
				hasMore = data.hasMore;
			} else {
				toast.error('Failed to load leaderboard.');
			}
		} catch {
			toast.error('Failed to load leaderboard. Check your connection and try again.');
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function handleTabChange(tab: string) {
		category = tabToCategory[tab];
		offset = 0;
		load();
	}

	function nextPage() {
		if (!hasMore) return;
		offset += PAGE_SIZE;
		load();
	}

	function prevPage() {
		if (offset === 0) return;
		offset = Math.max(0, offset - PAGE_SIZE);
		load();
	}

	function rankColor(rank: number) {
		if (rank === 1) return '#F5C518';
		if (rank === 2) return '#C0C0C0';
		if (rank === 3) return '#CD7F32';
		return undefined;
	}

	function formatValue(value: number) {
		if (category === 'networth') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
		return value.toLocaleString();
	}
</script>

<div class="flex h-full w-full flex-col gap-3 px-1 py-2">
	<div class="flex items-center gap-2">
		<Medal size={26} class="text-primary" />
		<h2 class="text-2xl font-bold">Leaderboard</h2>
	</div>
	<p class="text-sm text-muted-foreground">
		Top 3 in each category get a trophy!
	</p>

	<TopTab {tabs} currentTab={CATEGORY_META[category].short} onTabChange={handleTabChange} />

	{#if loading}
		<LoadingSpinner occupy_screen={false} />
	{:else if entries.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">
			{category === 'networth' ? 'No one has linked a Rugplay account yet.' : 'No data yet.'}
		</p>
	{:else}
		<div class="flex flex-col gap-1">
			{#each entries as entry (entry.userId)}
				<a
					href="/@{entry.handle}"
					onclick={(e) => {
						if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
						e.preventDefault();
						currentPage.set('profile' + entry.handle);
					}}
					class="flex items-center gap-3 rounded-[6px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] p-2 transition hover:bg-accent/50"
				>
					<div class="flex w-8 items-center justify-center">
						{#if entry.rank <= 3}
							<Medal size={20} color={rankColor(entry.rank)} fill={rankColor(entry.rank)} />
						{:else}
							<span class="text-sm font-semibold text-muted-foreground">#{entry.rank}</span>
						{/if}
					</div>
					<Avatar size={9} src={cdnUrl(entry.userId, 'small')} userId={entry.userId} />
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-semibold"><UserName name={entry.username} color={entry.nameColor} verified={entry.verified} /></span>
						<span class="truncate text-xs text-muted-foreground">@{entry.handle}</span>
					</div>
					<span class="font-bold tabular-nums">{formatValue(entry.value)}</span>
				</a>
			{/each}
		</div>

		<div class="flex items-center justify-between pt-1">
			<button
				class="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-40"
				disabled={offset === 0}
				onclick={prevPage}
			>
				<ChevronLeft size={16} /> Prev
			</button>
			<span class="text-xs text-muted-foreground">Ranks {offset + 1}–{offset + entries.length}</span>
			<button
				class="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-40"
				disabled={!hasMore}
				onclick={nextPage}
			>
				Next <ChevronRight size={16} />
			</button>
		</div>
	{/if}
</div>
