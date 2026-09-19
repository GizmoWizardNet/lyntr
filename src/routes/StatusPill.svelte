<script lang="ts">
	import { MessageCircle } from 'lucide-svelte';
	import StatusBubble from './StatusBubble.svelte';

	interface Props {
		text: string;
		class?: string;
	}

	let { text, class: className = '' }: Props = $props();

	let hovering = $state(false);
</script>

<div
	class="status-pill relative w-fit max-w-full items-center gap-1.5 {className}"
	onmouseenter={() => (hovering = true)}
	onmouseleave={() => (hovering = false)}
	role="status"
>
	<MessageCircle size={13} class="flex-shrink-0" />
	<span class="truncate">{text}</span>
	{#if hovering}
		<StatusBubble {text} />
	{/if}
</div>

<style>
	.status-pill {
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		font-family: var(--font-retro);
		font-size: 0.8rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-dark);
		border-left: 1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right: 1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}
</style>
