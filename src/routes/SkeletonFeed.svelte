<script lang="ts">
	
	interface Props {
		// Number of skeleton cards to show. Default matches roughly one screen of feed.
		count?: number;
	}

	let { count = 6 }: Props = $props();
</script>

{#each Array(count) as _}
	<div class="skel-card" aria-hidden="true">
		<!-- Header row: avatar + name/handle + timestamp -->
		<div class="skel-header">
			<div class="skel skel-avatar"></div>
			<div class="skel-meta">
				<div class="skel skel-line" style="width: 38%;"></div>
				<div class="skel skel-line" style="width: 22%; margin-top: 5px;"></div>
			</div>
			<!-- Ellipsis placeholder -->
			<div class="skel skel-icon"></div>
		</div>

		<!-- Content lines — vary widths so it looks organic -->
		<div class="skel-body">
			<div class="skel skel-line" style="width: 95%;"></div>
			<div class="skel skel-line" style="width: 80%; margin-top: 6px;"></div>
			<div class="skel skel-line" style="width: 55%; margin-top: 6px;"></div>
		</div>

		<!-- Action row: like / comment / repost / views -->
		<div class="skel-actions">
			{#each [28, 28, 28, 36] as w}
				<div class="skel skel-action" style="width: {w}px;"></div>
			{/each}
		</div>

		<!-- Separator -->
		<div class="skel-sep"></div>
	</div>
{/each}

<style>
	.skel-card {
		padding: 12px 4px 0;
		width: 100%;
	}

	/* Base shimmer block */
	.skel {
		border-radius: 6px;
		background: var(--color-background-secondary);
		position: relative;
		overflow: hidden;
	}
	.skel::after {
		content: '';
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(
			90deg,
			transparent 0%,
			var(--color-background-primary) 50%,
			transparent 100%
		);
		animation: shimmer 1.5s ease-in-out infinite;
	}

	/* Stagger shimmer per card so they don't all pulse in sync */
	.skel-card:nth-child(2) .skel::after { animation-delay: 0.15s; }
	.skel-card:nth-child(3) .skel::after { animation-delay: 0.30s; }
	.skel-card:nth-child(4) .skel::after { animation-delay: 0.45s; }
	.skel-card:nth-child(5) .skel::after { animation-delay: 0.60s; }
	.skel-card:nth-child(6) .skel::after { animation-delay: 0.75s; }

	@keyframes shimmer {
		0%   { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}

	.skel-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.skel-line {
		height: 11px;
	}

	.skel-icon {
		width: 20px;
		height: 20px;
		border-radius: 4px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.skel-action {
		height: 16px;
	}

	.skel-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}

	.skel-meta {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.skel-body {
		padding-left: 50px; /* align with text after avatar */
		display: flex;
		flex-direction: column;
		margin-bottom: 12px;
	}

	.skel-actions {
		padding-left: 50px;
		display: flex;
		gap: 20px;
		margin-bottom: 12px;
		align-items: center;
	}

	.skel-sep {
		height: 0.5px;
		background: var(--color-border-tertiary);
		width: 100%;
	}
</style>
