<script lang="ts">
	import { emojiIcon } from '$lib/emojiIcons';

	interface Props {
		emoji: string;
		size?: number;
	}
	let { emoji, size = 16 }: Props = $props();
	let icon = $derived(emojiIcon(emoji));
</script>

{#if icon}
	<img src={icon} alt={emoji} class="emoji-icon" style="width: {size}px; height: {size}px;" />
{:else}
	<span>{emoji}</span>
{/if}

<style>
	.emoji-icon {
		display: inline-block;
		object-fit: contain;
		vertical-align: middle;
	}
</style>
