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
		bottom: calc(100% + 10px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		width: max-content;
		max-width: 240px;
		padding: 8px 14px;
		border-radius: 14px;
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1.35;
		text-align: center;
		color: hsl(var(--foreground));
		background: hsl(var(--popover) / 0.5);
		/* Frosted glass depth */
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		backdrop-filter: blur(16px) saturate(180%);
		border: 1px solid hsl(var(--foreground) / 0.12);
		box-shadow:
			0 12px 28px -6px rgba(0, 0, 0, 0.35),
			0 2px 8px rgba(0, 0, 0, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.25),
			inset 0 0 0 1px rgba(255, 255, 255, 0.04);
		pointer-events: none;
		animation: status-bubble-pop 0.16s cubic-bezier(0.2, 0.8, 0.3, 1);
	}

	.status-bubble::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 55%);
		pointer-events: none;
	}

	.status-bubble-text {
		position: relative;
		white-space: normal;
		word-break: break-word;
	}

	.status-bubble-tail {
		position: absolute;
		bottom: -5px;
		left: 50%;
		width: 10px;
		height: 10px;
		transform: translateX(-50%) rotate(45deg);
		background: hsl(var(--popover) / 0.5);
		border-right: 1px solid hsl(var(--foreground) / 0.12);
		border-bottom: 1px solid hsl(var(--foreground) / 0.12);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		backdrop-filter: blur(16px) saturate(180%);
	}

	@keyframes status-bubble-pop {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(4px) scale(0.92);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.status-bubble {
			animation: none;
		}
	}
</style>