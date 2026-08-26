<!--
	UnderConstructionBanner.svelte
	Classic "this page is under construction" banner. Diagonal stripes use
	the site's own primary hue instead of yellow/black, so it still reads
	as Lyntr, not a generic GIF you'd find in 1999.
	Usage: <UnderConstructionBanner text="More features coming soon!" />
-->
<script lang="ts">
	export let text: string = 'UNDER CONSTRUCTION — CHECK BACK SOON';
</script>

<div class="uc-banner">
	<div class="uc-track">
		<span class="uc-text">{text}</span>
		<span class="uc-text">{text}</span>
	</div>
</div>

<style>
	.uc-banner {
		width: 100%;
		overflow: hidden;
		padding: 6px 0;
		background-image: repeating-linear-gradient(
			45deg,
			hsl(var(--primary)) 0px,
			hsl(var(--primary)) 12px,
			hsl(var(--primary-top)) 12px,
			hsl(var(--primary-top)) 24px
		);
		border-top: 2px solid var(--bevel-light);
		border-left: 2px solid var(--bevel-light);
		border-bottom: 2px solid var(--bevel-dark);
		border-right: 2px solid var(--bevel-dark);
		border-radius: 4px;
		box-shadow: var(--hard-shadow);
	}
	.uc-track {
		display: flex;
		width: max-content;
		animation: marquee 14s linear infinite;
	}
	.uc-text {
		flex-shrink: 0;
		padding: 0 2.5rem;
		font-family: var(--font-retro);
		font-weight: 700;
		font-size: 0.85rem;
		letter-spacing: 0.03em;
		color: hsl(var(--primary-foreground));
		text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
		white-space: nowrap;
	}
	@keyframes marquee {
		from { transform: translateX(0); }
		to { transform: translateX(-50%); }
	}
	@media (prefers-reduced-motion: reduce) {
		.uc-track { animation: none; }
	}
</style>
