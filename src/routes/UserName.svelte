<script lang="ts">
	import { getNameColor } from '@/nameColors';

	interface Props {
		name: string;
		color?: string | null;
		// Custom name colors are a verified-only perk. Gating it here, in the
		// one component everything renders through, means there's no call
		// site anywhere that can accidentally show a color for someone who
		// isn't (or is no longer) verified.
		verified?: boolean;
		class?: string;
	}

	let { name, color = null, verified = false, class: className = '' }: Props = $props();

	const def = $derived(verified ? getNameColor(color) : null);
</script>

{#if def?.kind === 'gradient'}
	<span class="name-gradient {className}" style="--name-gradient: {def.value}">{name}</span>
{:else}
	<span class={className} style={def ? `color: ${def.value}` : undefined}>{name}</span>
{/if}

<style>
	.name-gradient {
		background-image: var(--name-gradient);
		background-size: 250% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
		animation: name-gradient-shift 5s linear infinite;
	}

	@keyframes name-gradient-shift {
		0% {
			background-position: 0% 50%;
		}
		100% {
			background-position: 250% 50%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.name-gradient {
			animation: none;
			background-position: 0% 50%;
		}
	}
</style>
