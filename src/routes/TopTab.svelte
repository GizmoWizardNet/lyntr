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

<div class="tab-row flex items-center gap-2 overflow-x-auto md:justify-center md:gap-3 md:overflow-visible">
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
	.tab-pill {
		position: relative;
		overflow: hidden;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		padding: 6px 18px;
		border-radius: 999px;
		font-size: 1.05rem;
		font-weight: 600;
		cursor: pointer;
		user-select: none;
		background: transparent;
		border: 1px solid transparent;
		color: hsl(var(--foreground));
		white-space: nowrap;
		transition:
			background 0.15s ease-in-out,
			border-color 0.15s ease-in-out;
	}
	@media (max-width: 480px) {
		.tab-pill {
			padding: 5px 12px;
			font-size: 0.92rem;
		}
	}

	.tab-row {
		scrollbar-width: none;
	}
	.tab-row::-webkit-scrollbar {
		display: none;
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
	.tab-fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: hsl(var(--primary) / 0.85);
		z-index: 0;
	}
</style>