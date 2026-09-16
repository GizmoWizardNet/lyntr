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

<div class="tab-track">
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
</div>

<style>
	.tab-track {
		position: relative;
		border-radius: 999px;
		padding: 5px;
		background: hsl(var(--popover) / 0.5);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		backdrop-filter: blur(16px) saturate(180%);
		border: 1px solid hsl(var(--foreground) / 0.1);
		box-shadow:
			0 10px 24px -8px rgba(0, 0, 0, 0.3),
			0 1px 4px rgba(0, 0, 0, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.2),
			inset 0 0 0 1px rgba(255, 255, 255, 0.04);
	}
	.tab-track::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 55%);
		pointer-events: none;
	}

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
		padding: 3px 4px;
		margin: -3px -4px;
		scroll-padding-inline: 8px;
	}
	.tab-row::-webkit-scrollbar {
		display: none;
	}

	.tab-pill {
		margin: 1px;
	}

	.tab-pill:hover:not(.active) {
		background: hsl(var(--foreground) / 0.06);
		border-color: hsl(var(--foreground) / 0.12);
	}

	.tab-pill.active {
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--foreground) / 0.12);
		box-shadow:
			0 6px 14px -4px hsl(var(--primary) / 0.55),
			0 1px 3px rgba(0, 0, 0, 0.2);
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
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.3),
			inset 0 -1px 0 rgba(0, 0, 0, 0.08);
		z-index: 0;
	}
</style>