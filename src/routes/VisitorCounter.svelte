<!--
	VisitorCounter.svelte
	Classic hit-counter widget. Drop it anywhere in the sidebar/footer.
	Uses Lyntr's own palette (var(--primary)) instead of the stock
	green-on-black LCD look — same bit, house colors.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	let count: number | null = null;

	onMount(() => {
		fetch('/api/site/visitor-count')
			.then((r) => r.json())
			.then((data) => (count = data.count))
			.catch(() => {
				// Even the fallback is in-character: old counters broke constantly.
				count = null;
			});
	});

	$: digits = (count ?? 0).toString().padStart(6, '0').split('');
</script>

<div class="counter-widget">
	<span class="counter-label">VISITORS SINCE INSTALL</span>
	<div class="odometer" aria-label="{count ?? '??????'} visitors">
		{#if count === null}
			<span class="digit error">ERR</span>
		{:else}
			{#each digits as d}
				<span class="digit">{d}</span>
			{/each}
		{/if}
	</div>
</div>

<style>
	.counter-widget {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 8px;
		width: 100%;
		font-family: var(--font-retro);
	}
	.counter-label {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}
	.odometer {
		display: flex;
		gap: 2px;
		padding: 4px 6px;
		background: hsl(var(--primary-dim));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		border-radius: 3px;
		box-shadow: var(--inset-shadow);
	}
	.digit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 18px;
		font-family: 'Consolas', 'Courier New', monospace;
		font-weight: 700;
		font-size: 13px;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary) / 0.25);
		border-radius: 2px;
	}
	.digit.error {
		width: auto;
		padding: 0 4px;
		font-size: 10px;
		color: hsl(var(--destructive));
	}
</style>
