<!--
	NetWorthBadge.svelte
	Shows off the linked Rugplay account's single largest coin holding.
	Renders nothing if the profile has no Rugplay account linked, so it's
	safe to drop in anywhere without layout side effects.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	export let handle: string;
	export let compact: boolean = false; // smaller variant for hover cards

	type State =
		| { status: 'loading' }
		| { status: 'unlinked' }
		| { status: 'no-bags'; scannedCoins: number }
		| { status: 'error' }
		| {
				status: 'ok';
				coin: { symbol: string; name: string; icon: string };
				value: number;
				percentage: number;
				rank: number;
		  };

	let state: State = { status: 'loading' };

	onMount(() => {
		fetch(`/api/rugplay/networth/${handle}`)
			.then((r) => r.json())
			.then((data) => {
				if (data.error) {
					state = { status: 'error' };
				} else if (!data.linked) {
					state = { status: 'unlinked' };
				} else if (!data.found) {
					state = { status: 'no-bags', scannedCoins: data.scannedCoins };
				} else {
					state = {
						status: 'ok',
						coin: data.coin,
						value: data.value,
						percentage: data.percentage,
						rank: data.rank
					};
				}
			})
			.catch(() => {
				state = { status: 'error' };
			});
	});

	function fmt(n: number): string {
		if (n == null) return '—';
		if (Math.abs(n) >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B';
		if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
		if (Math.abs(n) >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
		return '$' + n.toFixed(2);
	}
</script>

{#if state.status === 'loading'}
	<div class="badge skel" class:compact></div>
{:else if state.status === 'ok'}
	{@const s = state}
	<a
		class="badge ok"
		class:compact
		href="https://rugplay.com/coin/{s.coin.symbol}"
		target="_blank"
		rel="noopener noreferrer"
		on:click|stopPropagation
		title="#{s.rank} holder of ${s.coin.symbol} — {s.percentage.toFixed(2)}% of supply"
	>
		<img
			src="https://rugplay.com/rugplay.svg"
			alt="Rugplay"
			class="rugplay-logo"
			on:error={(e) => (e.currentTarget.style.display = 'none')}
		/>
		<img
			src="https://rugplay.com/api/proxy/s3/{s.coin.icon}"
			alt={s.coin.name}
			class="icon"
			on:error={(e) => (e.currentTarget.style.display = 'none')}
		/>
		<span class="label">Biggest bag:</span>
		<span class="value">{fmt(s.value)}</span>
		<span class="sym">${s.coin.symbol}</span>
		{#if s.rank <= 3}<span class="rank">#{s.rank}</span>{/if}
	</a>
{:else if state.status === 'no-bags'}
	<div class="badge muted" class:compact>Rugplay linked, but holding nothing in the top coins</div>
{:else if state.status === 'error'}
	<!-- fail silently — this is a fun-extra, not core functionality -->
{/if}

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--color-border-tertiary, hsl(var(--border)));
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-primary, inherit);
		background: var(--color-background-secondary, transparent);
		text-decoration: none;
		max-width: fit-content;
	}
	.badge.compact { font-size: 11px; padding: 3px 8px; }
	.badge.ok:hover { filter: brightness(1.08); }
	.badge.muted { color: var(--color-text-secondary, #888); font-weight: 500; }
	.skel {
		width: 140px;
		height: 22px;
		background: var(--color-background-secondary, #2a2a2a);
		position: relative;
		overflow: hidden;
		border: none;
	}
	.skel::after {
		content: '';
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(90deg, transparent, var(--color-background-primary) 50%, transparent);
		animation: shimmer 1.4s ease-in-out infinite;
	}
	@keyframes shimmer { to { transform: translateX(100%); } }

	.icon { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.rugplay-logo { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; }
	.label { color: var(--color-text-secondary, #888); font-weight: 500; }
	.value { font-family: var(--font-mono, monospace); }
	.sym { color: var(--color-text-secondary, #888); }
	.rank {
		margin-left: 2px;
		padding: 0 5px;
		border-radius: 999px;
		background: #f59e0b;
		color: #1a1a1a;
		font-size: 10px;
	}
</style>
