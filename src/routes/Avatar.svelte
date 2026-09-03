<script lang="ts">
	import { once } from 'svelte/legacy';

	import { createEventDispatcher } from 'svelte';
	import { onlineUsers } from './stores';

	
	
	interface Props {
		size?: number;
		src?: string;
		alt?: string;
		border?: boolean;
		editable?: boolean;
		// Pass the userId to show the presence dot. Omit or pass null to hide it.
		userId?: string | null;
		// showPresence can be set to false to explicitly hide the dot even if userId is set
		showPresence?: boolean;
	}

	let {
		size = 12,
		src = $bindable('https://github.com/face-hh.png'),
		alt = 'Avatar',
		border = false,
		editable = false,
		userId = null,
		showPresence = true
	}: Props = $props();

	const dispatch = createEventDispatcher();

	function handleClick() {
		if (editable) {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/*';
			input.onchange = (e: any) => {
				const file = e.target.files[0];
				if (file) {
					dispatch('change', { file });
					const reader = new FileReader();
					reader.onload = (e) => { src = (e.target as any).result; };
					reader.readAsDataURL(file);
				}
			};
			input.click();
		}
	}

	function handleImageError(event: Event) {
    		const img = event.target as HTMLImageElement;
    		img.src = '/default.png';
	}

	let isOnline = $derived(userId && showPresence ? $onlineUsers.has(userId) : false);

	// Map Tailwind size units to pixel values for the dot sizing
	// size prop is a Tailwind h-/w- number (e.g. 10 = 2.5rem = 40px)
	let dotSize = $derived(size >= 20 ? 32 : size >= 12 ? 18 : 12);
	let dotOffset = $derived(size >= 20 ? 2 : 1);
</script>

<div class="relative inline-block flex-shrink-0" style="width: {size * 4}px; height: {size * 4}px;">
	<img
		{src}
		{alt}
		loading="lazy"
		decoding="async"
		class="h-full w-full rounded-full {border ? 'border-2 border-solid border-primary' : ''} {editable ? 'cursor-pointer' : ''} text-center"
		onclick={handleClick}
		onkeydown={(e) => editable && (e.key === 'Enter' || e.key === ' ') && handleClick()}
		onerror={once(handleImageError)}
		role={editable ? 'button' : undefined}
		tabindex={editable ? 0 : undefined}
	/>

	{#if userId && showPresence}
		<span
			class="presence-dot"
			class:online={isOnline}
			class:offline={!isOnline}
			style="
				width: {dotSize}px;
				height: {dotSize}px;
				bottom: {dotOffset}px;
				right: {dotOffset}px;
			"
			title={isOnline ? 'Online' : 'Offline'}
		></span>
	{/if}
</div>

<style>
	.presence-dot {
		position: absolute;
		border-radius: 50%;
		border: 2px solid var(--color-background-primary, hsl(var(--background)));
		transition: background-color 0.4s ease;
		pointer-events: none;
	}
	.presence-dot.online {
		background-color: #22c55e; /* green-500 */
		box-shadow: 0 0 0 1px #16a34a44;
	}
	.presence-dot.offline {
		background-color: #6b7280; /* gray-500 */
	}
</style>
