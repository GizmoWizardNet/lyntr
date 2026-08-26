<!--
	BlinkText.svelte
	The <blink> tag, brought back on purpose. Use sparingly — that was
	true in 2002 too.
	Usage: <BlinkText>★ NEW ★</BlinkText>  or  <BlinkText color="destructive">HOT</BlinkText>
-->
<script lang="ts">
	export let color: 'primary' | 'destructive' = 'primary';
</script>

<span class="blink-text" class:destructive={color === 'destructive'}>
	<slot />
</span>

<style>
	.blink-text {
		font-family: var(--font-retro);
		font-weight: 700;
		color: hsl(var(--primary));
		animation: blink 1s steps(1) infinite;
	}
	.blink-text.destructive {
		color: hsl(var(--destructive));
	}
	@keyframes blink {
		50% { opacity: 0; }
	}
	@media (prefers-reduced-motion: reduce) {
		.blink-text { animation: none; }
	}
</style>
