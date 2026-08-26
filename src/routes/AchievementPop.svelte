<script lang="ts">
	// ── Achievement Pop ───────────────────────────────────────────
	// evaluateAchievements() (src/lib/server/achievements.ts) broadcasts an
	// `achievement_unlocked` WS event whenever it unlocks something new —
	// this listens for those and shows a bigger, tier-colored celebration
	// separate from the regular Coin Pop toast (which still fires too,
	// since the achievement bonus goes through the same `lyntcoins_awarded`
	// event as everything else). Mounted once in MainPage.svelte.
	import { onDestroy, onMount } from 'svelte';
	import { wsClient } from '$lib/ws-client';
	import { playCoinChime } from '$lib/sound';
	import { tierColor, type AchievementTier } from '$lib/achievements';
	import { currentPage } from './stores';

	interface UnlockEvent {
		key: string;
		name: string;
		description: string;
		tier: AchievementTier;
		coinReward: number;
		icon: string;
	}

	type PopEntry = UnlockEvent & { id: number };

	let pops = $state<PopEntry[]>([]);
	let nextId = 0;

	function handleUnlock(data: UnlockEvent) {
		const entry: PopEntry = { ...data, id: nextId++ };
		pops = [...pops, entry];
		// Reuses the coin chime — an achievement unlock is, among other
		// things, a Community XP pickup, so the same sound cue keeps the
		// two feeling like one consistent reward system rather than two.
		playCoinChime();

		setTimeout(() => {
			pops = pops.filter((p) => p.id !== entry.id);
		}, 4200);
	}

	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		unsubscribe = wsClient.on('achievement_unlocked', handleUnlock);
	});

	onDestroy(() => {
		unsubscribe?.();
	});
</script>

{#if pops.length > 0}
	<div class="pointer-events-none fixed left-1/2 top-6 z-[110] flex -translate-x-1/2 flex-col items-center gap-2">
		{#each pops as pop (pop.id)}
			<div
				class="achievement-toast pointer-events-auto flex cursor-pointer items-center gap-3 rounded-lg border-2 bg-card px-4 py-3 shadow-xl"
				style={`border-color: ${tierColor(pop.tier)}; background: linear-gradient(180deg, ${tierColor(pop.tier)}18, transparent);`}
				onclick={() => currentPage.set('achievements')}
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && currentPage.set('achievements')}
			>
				<div
					class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2"
					style={`border-color: ${tierColor(pop.tier)}; background: ${tierColor(pop.tier)}22;`}
				>
					<img src={`/achievements/${pop.icon}`} alt={pop.name} class="h-6 w-6 object-contain" />
				</div>
				<div class="flex flex-col leading-tight">
					<span class="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
						Achievement unlocked
					</span>
					<span class="font-bold">{pop.name}</span>
					<span class="text-muted-foreground text-[11px]">
						{pop.description} · Claim +{pop.coinReward.toLocaleString()} XP on your Achievements page
					</span>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.achievement-toast {
		animation:
			achievement-in 0.4s cubic-bezier(0.2, 0.9, 0.25, 1.4),
			achievement-out 0.35s ease-in 3.85s forwards;
	}

	@keyframes achievement-in {
		0% {
			transform: translateY(-16px) scale(0.9);
			opacity: 0;
		}
		60% {
			transform: translateY(2px) scale(1.02);
			opacity: 1;
		}
		100% {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}

	@keyframes achievement-out {
		to {
			transform: translateY(-10px) scale(0.94);
			opacity: 0;
		}
	}
</style>
