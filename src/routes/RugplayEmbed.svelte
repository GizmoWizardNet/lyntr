<script lang="ts">
	import { onMount } from 'svelte';

	export let symbol: string;

	export let authorHandle: string | undefined = undefined;

	type CoinState =
		| { status: 'loading' }
		| { status: 'error'; message: string }
		| { status: 'disabled'; reason: 'not_enabled' | 'no_valid_key' }
		| { status: 'ok'; coin: CoinData };

	type CoinData = {
		name: string;
		symbol: string;
		icon: string;
		currentPrice: number;
		change24h: number;
		marketCap: number;
		volume24h: number;
		isListed: boolean;
	};

	let state: CoinState = { status: 'loading' };

	const MAX_ATTEMPTS = 3;
	const RETRY_DELAY_MS = 1000;

	function sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function loadCoin() {
		const qs = authorHandle ? `?authorHandle=${encodeURIComponent(authorHandle)}` : '';
		let lastMessage = 'Failed to load';

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			try {
				const r = await fetch(`/api/rugplay/coin/${symbol}${qs}`);
				const data = await r.json();

				if (data.error) {
					lastMessage = data.error;
					if (r.status === 404 || r.status === 503) break;
				} else if (data.status === 'disabled') {
					state = { status: 'disabled', reason: data.reason };
					return;
				} else {
					state = { status: 'ok', coin: data.coin };
					return;
				}
			} catch {
				lastMessage = 'Failed to load';
			}

			if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
		}

		state = { status: 'error', message: lastMessage };
	}

	onMount(() => {
		loadCoin();
	});

	function fmt(n: number): string {
		if (n == null) return '—';
		if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
		if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
		if (Math.abs(n) >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
		return n.toFixed(2);
	}

	function fmtPrice(n: number): string {
		if (!n) return '0';
		if (n < 0.0001) return n.toExponential(3);
		if (n < 0.01)   return n.toFixed(6);
		if (n < 1)      return n.toFixed(4);
		return n.toFixed(2);
	}

	$: isUp = state.status === 'ok' && state.coin.change24h >= 0;
</script>

<div class="card">
	{#if state.status === 'loading'}
		<div class="loading-row">
			<div class="skel skel-icon"></div>
			<div style="flex:1;display:flex;flex-direction:column;gap:5px">
				<div class="skel" style="height:10px;width:70%"></div>
				<div class="skel" style="height:10px;width:45%"></div>
			</div>
			<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
				<div class="skel" style="height:10px;width:50px"></div>
				<div class="skel" style="height:10px;width:35px"></div>
			</div>
		</div>

	{:else if state.status === 'disabled'}
		<p class="disabled-msg">
			{state.reason === 'not_enabled'
				? "OP doesn't have Rugplay Enhancements enabled."
				: "OP doesn't have a valid Rugplay key."}
		</p>

	{:else if state.status === 'error'}
		<p class="error">${symbol} — {state.message}</p>

	{:else if state.status === 'ok'}
		{@const c = state.coin}
		<div class="coin-row">
			<div class="left">
				<img
					src="https://rugplay.com/api/proxy/s3/{c.icon}"
					alt={c.name}
					class="icon"
					on:error={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
				/>
				<div class="info">
					<span class="name">{c.name}</span>
					<span class="sym">${c.symbol}</span>
				</div>
			</div>
			<div class="right">
				<span class="price">{fmtPrice(c.currentPrice)}</span>
				<span class="change" class:up={isUp} class:down={!isUp}>
					{isUp ? '▲' : '▼'} {Math.abs(c.change24h).toFixed(2)}%
				</span>
			</div>
		</div>

		<div class="stats">
			<div class="stat"><span class="label">MCap</span><span class="val">${fmt(c.marketCap)}</span></div>
			<div class="stat"><span class="label">Vol</span><span class="val">${fmt(c.volume24h)}</span></div>
			<div class="stat">
				<span class="label">Status</span>
				<span class="val" class:listed={c.isListed} class:unlisted={!c.isListed}>
					{c.isListed ? 'Listed' : 'Unlisted'}
				</span>
			</div>
		</div>

		<a
			href="https://rugplay.com/coin/{c.symbol}"
			target="_blank"
			rel="noopener noreferrer"
			class="link"
			on:click|stopPropagation
		>View on Rugplay ↗</a>
	{/if}
</div>

<style>
	.card {
		min-width: 230px;
		max-width: 270px;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* skeleton */
	.loading-row { display: flex; align-items: center; gap: 10px; }
	.skel {
		background: var(--color-background-secondary);
		border-radius: 4px;
		position: relative;
		overflow: hidden;
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
	.skel-icon { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }

	/* error */
	.error { font-size: 12px; color: #dc2626; margin: 0; }
	.disabled-msg { font-size: 12px; color: var(--color-text-secondary); margin: 0; font-style: italic; }

	/* coin */
	.coin-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.left  { display: flex; align-items: center; gap: 8px; }
	.right { display: flex; flex-direction: column; align-items: flex-end; }
	.icon  { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.info  { display: flex; flex-direction: column; }
	.name  { font-size: 13px; font-weight: 600; color: var(--color-text-primary); line-height: 1.2; }
	.sym   { font-size: 11px; color: var(--color-text-secondary); }
	.price { font-size: 14px; font-weight: 600; color: var(--color-text-primary); font-family: var(--font-mono, monospace); }
	.change { font-size: 11px; font-weight: 600; }
	.change.up   { color: #16a34a; }
	.change.down { color: #dc2626; }

	/* stats */
	.stats { display: flex; justify-content: space-between; padding-top: 8px; border-top: 0.5px solid var(--color-border-tertiary); }
	.stat  { display: flex; flex-direction: column; gap: 2px; }
	.label { font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
	.val   { font-size: 11px; font-weight: 600; color: var(--color-text-primary); font-family: var(--font-mono, monospace); }
	.listed   { color: #16a34a; }
	.unlisted { color: var(--color-text-secondary); }

	/* link */
	.link { font-size: 11px; color: var(--color-text-secondary); text-decoration: none; text-align: right; }
	.link:hover { text-decoration: underline; }
</style>