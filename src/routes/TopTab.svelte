<script lang="ts">
	interface Props {
		tabs: string[];
		currentTab: string;
		onTabChange: (tab: string) => void;
	}

	let { tabs, currentTab, onTabChange }: Props = $props();
</script>

<div class="tab-track">
	<div class="tab-row flex items-center gap-1.5 overflow-x-auto md:justify-center md:overflow-visible">
		{#each tabs as tab}
			<button
				type="button"
				class="tab-pill"
				class:active={currentTab === tab}
				onmousedown={() => onTabChange(tab)}
			>
				{tab}
			</button>
		{/each}
	</div>
</div>

<style>
	.tab-track {
		border-radius: var(--radius-md);
		padding: 4px;
		background: hsl(var(--input));
		box-shadow: var(--inset-shadow);
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
	}

	.tab-row {
		scrollbar-width: none;
	}
	.tab-row::-webkit-scrollbar {
		display: none;
	}

	.tab-pill {
		flex-shrink: 0;
		padding: 5px 14px;
		border-radius: var(--radius-sm);
		font-family: var(--font-retro);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		cursor: pointer;
		user-select: none;
		background: transparent;
		border: 1px solid transparent;
		color: hsl(var(--foreground) / 0.75);
		white-space: nowrap;
		transition:
			background-color 0.1s ease-in-out,
			box-shadow 0.1s ease-in-out,
			color 0.1s ease-in-out;
	}
	@media (max-width: 480px) {
		.tab-pill {
			padding: 4px 10px;
			font-size: 0.85rem;
		}
	}

	.tab-pill:hover:not(.active) {
		background: hsl(var(--foreground) / 0.06);
		box-shadow: var(--inset-shadow);
		color: hsl(var(--foreground));
	}

	.tab-pill.active {
		background: linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)));
		color: hsl(var(--primary-foreground));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	.tab-pill:active {
		filter: brightness(0.95);
	}
</style>