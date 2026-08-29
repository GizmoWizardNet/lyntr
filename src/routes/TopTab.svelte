<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	interface Props {
		tabs: string[];
		currentTab: string;
		onTabChange: (tab: string) => void;
	}

	let { tabs, currentTab, onTabChange }: Props = $props();
</script>

<div class="tab-row flex justify-evenly md:justify-center md:gap-3 gap-2">
	{#each tabs as tab}
		<button
			type="button"
			class="tab-pill"
			class:active={currentTab === tab}
			onmousedown={() => onTabChange(tab)}
		>
			<span class="tab-label">{tab}</span>
			{#if currentTab === tab}
				<div
					class="tab-fill"
					in:fly={{ y: 6, duration: 200, easing: quintOut }}
					out:fly={{ y: 6, duration: 150, easing: quintOut }}
				></div>
			{/if}
		</button>
	{/each}
</div>

<style>
	/* Simple glass — dark translucent pill, thin border, faint shadow, no
	   blur/shine/saturation stacking. The earlier version reused the same
	   heavy --aero-* tokens as OutlineButton's circular nav buttons (12px
	   blur + 160% saturate + a gradient shine layer), which reads fine on
	   a small icon-only circle but got noisy and "frosted" once stretched
	   across a whole row of wide text pills — closer to the Smolish-style
	   reference (flat dark fill, subtle top border, no glare) than the
	   full aero treatment. */
	.tab-pill {
		position: relative;
		overflow: hidden;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px 18px;
		border-radius: 999px;
		font-size: 1.05rem;
		font-weight: 600;
		cursor: pointer;
		user-select: none;
		background: transparent;
		border: 1px solid transparent;
		color: hsl(var(--foreground));
		transition:
			background 0.15s ease-in-out,
			border-color 0.15s ease-in-out;
	}

	.tab-pill:hover:not(.active) {
		background: hsl(var(--foreground) / 0.06);
		border-color: hsl(var(--foreground) / 0.12);
	}

	.tab-pill.active {
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--foreground) / 0.12);
	}

	.tab-label {
		position: relative;
		z-index: 1;
	}

	/* The active pill's fill — a separate absolutely-positioned layer
	   (rather than just setting .tab-pill.active's own background) so it
	   can fly in/out on tab switch the same way the old underline bar
	   did, instead of the whole pill hard-cutting between states. Flat
	   primary color, no gradient/shine — matches the simplified look. */
	.tab-fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: hsl(var(--primary) / 0.85);
		z-index: 0;
	}
</style>