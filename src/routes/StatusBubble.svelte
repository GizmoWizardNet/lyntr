<script lang="ts">
	interface Props {
		text: string;
	}

	let { text }: Props = $props();
</script>

<div class="status-bubble" role="status">
	<span class="status-bubble-text">{text}</span>
	<span class="status-bubble-tail"></span>
</div>

<style>
	.status-bubble {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		width: max-content;
		max-width: 240px;
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		font-family: var(--font-retro);
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.35;
		text-align: center;
		color: hsl(var(--popover-foreground));
		background: hsl(var(--popover));
		border-top: 1.5px solid var(--bevel-light);
		border-left: 1.5px solid var(--bevel-light);
		border-bottom: 1.5px solid var(--bevel-dark);
		border-right: 1.5px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow);
		pointer-events: none;
	}

	.status-bubble-text {
		position: relative;
		white-space: normal;
		word-break: break-word;
	}

	.status-bubble-tail {
		position: absolute;
		bottom: -6px;
		left: 50%;
		width: 9px;
		height: 9px;
		transform: translateX(-50%) rotate(45deg);
		background: hsl(var(--popover));
		border-right: 1.5px solid var(--bevel-dark);
		border-bottom: 1.5px solid var(--bevel-dark);
	}
</style>