<script lang="ts">
	import UserName from './UserName.svelte';
	import StatusBubble from './StatusBubble.svelte';

	interface Props {
		name: string;
		color?: string | null;
		verified?: boolean;
		class?: string;
		statusText?: string | null;
		// null = forever, otherwise an ISO timestamp string / Date.
		statusExpiresAt?: string | Date | null;
	}

	let {
		name,
		color = null,
		verified = false,
		class: className = '',
		statusText = null,
		statusExpiresAt = null
	}: Props = $props();

	let hovering = $state(false);
	const isLive = $derived(
		!!statusText && (!statusExpiresAt || new Date(statusExpiresAt).getTime() > Date.now())
	);
</script>

<span
	class="relative inline-block"
	onmouseenter={() => isLive && (hovering = true)}
	onmouseleave={() => (hovering = false)}
	onclick={(e) => {
		if (!isLive) return;
		e.stopPropagation();
		hovering = !hovering;
	}}
	role={isLive ? 'button' : undefined}
	tabindex={isLive ? 0 : undefined}
>
	<UserName {name} {color} {verified} class={className} />
	{#if hovering && isLive}
		<StatusBubble text={statusText as string} />
	{/if}
</span>