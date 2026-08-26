<script lang="ts">
	// ── Coin Pop ──────────────────────────────────────────────────
	// Every time the server pays out Community XP for anything — a post,
	// a like/reply/repost received, a streak bonus, an achievement — it
	// broadcasts a `lyntcoins_awarded` WS event to that user (see
	// lib/server/lyntcoins.ts). This component just listens for those and
	// throws up a little celebratory pickup toast, purely cosmetic,
	// mounted once at the top of the authenticated shell (MainPage.svelte)
	// so it works no matter what page you're looking at.
	//
	// Note: the underlying currency is still called "LyntCoins"/"lynt_coins"
	// everywhere in the backend (DB columns, API fields, event payloads) —
	// only the user-facing label changed to "Community XP". Renaming the
	// backend would mean a real migration for zero user-visible benefit.
	import { onDestroy, onMount } from 'svelte';
	import { wsClient } from '$lib/ws-client';
	import { playCoinChime } from '$lib/sound';
	import { VolumeHighIcon, VolumeMute02Icon } from '@hugeicons/core-free-icons';
	import HugeIcon from './HugeIcon.svelte';

	type Reason =
		| 'post_created'
		| 'like_received'
		| 'reply_received'
		| 'bookmark_received'
		| 'repost_received'
		| 'curator_bonus'
		| 'streak_bonus'
		| 'achievement_bonus';

	const REASON_LABEL: Record<Reason, string> = {
		post_created: 'Posted a lynt',
		like_received: 'Someone liked your lynt',
		reply_received: 'Someone replied to you',
		bookmark_received: 'Someone bookmarked your lynt',
		repost_received: 'Someone reposted you',
		curator_bonus: 'Early curator bonus',
		streak_bonus: 'Login streak bonus',
		achievement_bonus: 'Achievement unlocked'
	};

	type PopEntry = { id: number; amount: number; label: string; capped: boolean };

	let pops = $state<PopEntry[]>([]);
	let nextId = 0;
	let soundOn = $state(true);

	if (typeof localStorage !== 'undefined') {
		soundOn = localStorage.getItem('lyntr:coinpop-sound') !== 'off';
	}

	function toggleSound() {
		soundOn = !soundOn;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('lyntr:coinpop-sound', soundOn ? 'on' : 'off');
		}
	}

	function handleAward(data: { amount: number; reason: Reason; capped: boolean }) {
		if (!data.amount || data.amount <= 0) return;

		const entry: PopEntry = {
			id: nextId++,
			amount: data.amount,
			label: REASON_LABEL[data.reason] ?? 'Community XP earned',
			capped: data.capped
		};
		pops = [...pops, entry];
		if (soundOn) playCoinChime();

		setTimeout(() => {
			pops = pops.filter((p) => p.id !== entry.id);
		}, 2600);
	}

	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		unsubscribe = wsClient.on('lyntcoins_awarded', handleAward);
	});

	onDestroy(() => {
		unsubscribe?.();
	});
</script>

{#if pops.length > 0}
	<div class="pointer-events-none fixed bottom-20 right-4 z-[100] flex flex-col items-end gap-2 md:bottom-6">
		{#each pops as pop (pop.id)}
			<div class="pop-toast pointer-events-auto flex items-center gap-2 rounded-lg border-2 bg-card px-3 py-2 shadow-lg" style="border-style: outset;">
				<img src="/gem_badge.png" alt="Community XP" class="h-7 w-7 flex-shrink-0" />
				<div class="flex flex-col leading-tight">
					<span class="font-bold text-primary">+{pop.amount.toLocaleString()} XP</span>
					<span class="text-muted-foreground text-[11px]">{pop.label}{pop.capped ? ' · daily cap' : ''}</span>
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if pops.length > 0}
	<button
		type="button"
		class="text-muted-foreground hover:text-foreground fixed bottom-3 right-3 z-[100] flex items-center justify-center rounded-full border bg-card/80 p-1.5 opacity-60 backdrop-blur transition-opacity hover:opacity-100"
		onclick={toggleSound}
		aria-label={soundOn ? 'Mute coin sounds' : 'Unmute coin sounds'}
		title={soundOn ? 'Mute coin sounds' : 'Unmute coin sounds'}
	>
		<HugeIcon icon={soundOn ? VolumeHighIcon : VolumeMute02Icon} size={14} />
	</button>
{/if}

<style>
	.pop-toast {
		animation: pop-in 0.35s cubic-bezier(0.2, 0.9, 0.25, 1.4), pop-out 0.3s ease-in 2.3s forwards;
	}

	@keyframes pop-in {
		0% {
			transform: translateY(12px) scale(0.85);
			opacity: 0;
		}
		60% {
			transform: translateY(-2px) scale(1.03);
			opacity: 1;
		}
		100% {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}

	@keyframes pop-out {
		to {
			transform: translateY(-8px) scale(0.92);
			opacity: 0;
		}
	}
</style>
