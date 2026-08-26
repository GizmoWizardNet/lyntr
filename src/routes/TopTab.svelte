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
	/* Aero pill tabs — same --aero-* tokens as OutlineButton's .shit, kept
	   as a separate ruleset (rather than sharing a class) since a tab
	   needs the active fill to sit *behind* its own label as a positioned
	   layer, where a nav button just swaps its whole background. */
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
			border-color 0.15s ease-in-out,
			box-shadow 0.15s ease-in-out;
	}

	.tab-pill:hover:not(.active) {
		background: var(--aero-surface);
		border-color: var(--aero-border-top);
		border-bottom-color: var(--aero-border-bottom);
		box-shadow: var(--aero-shadow);
		-webkit-backdrop-filter: blur(var(--aero-blur)) saturate(160%);
		backdrop-filter: blur(var(--aero-blur)) saturate(160%);
	}

	.tab-pill.active {
		color: hsl(var(--primary-foreground));
		border-color: var(--aero-border-top);
		border-bottom-color: rgba(0, 0, 0, 0.3);
		box-shadow: var(--aero-shadow-active);
	}

	.tab-label {
		position: relative;
		z-index: 1;
	}

	/* The active pill's glass fill — a separate absolutely-positioned
	   layer (rather than just setting .tab-pill.active's own background)
	   so it can fly in/out on tab switch the same way the old underline
	   bar did, instead of the whole pill hard-cutting between states. */
	.tab-fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(to bottom, hsl(var(--primary-top)) 0%, hsl(var(--primary)) 100%);
		z-index: 0;
	}

	.tab-fill::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--aero-shine);
	}
</style>
