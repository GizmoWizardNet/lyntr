<script lang="ts">
	// A minimal Svelte 4-compatible renderer for @hugeicons/core-free-icons icon data.
	// The official @hugeicons/svelte requires Svelte 5, so we render the icon tuples ourselves.
	//
	// Usage:
	//   import { Moon01Icon } from '@hugeicons/core-free-icons';
	//   import HugeIcon from './HugeIcon.svelte';
	//   <HugeIcon icon={Moon01Icon} size={24} />

	
	interface Props {
		// Icon data is an array of [tagName, attrs] tuples
		icon: Array<[string, Record<string, string>]>;
		size?: number;
		strokeWidth?: number;
		color?: string;
		className?: string;
	}

	let {
		icon,
		size = 24,
		strokeWidth = 1.5,
		color = 'currentColor',
		className = ''
	}: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	class={className}
	aria-hidden="true"
>
	{#each icon as [tag, attrs]}
		{#if tag === 'path'}
			<path
				d={attrs.d}
				stroke={attrs.stroke ?? color}
				stroke-width={attrs.strokeWidth ?? strokeWidth}
				stroke-linecap={attrs.strokeLinecap ?? undefined}
				stroke-linejoin={attrs.strokeLinejoin ?? undefined}
				fill={attrs.fill ?? 'none'}
				opacity={attrs.opacity ?? undefined}
			/>
		{:else if tag === 'circle'}
			<circle
				cx={attrs.cx}
				cy={attrs.cy}
				r={attrs.r}
				stroke={attrs.stroke ?? color}
				stroke-width={attrs.strokeWidth ?? strokeWidth}
				fill={attrs.fill ?? 'none'}
				opacity={attrs.opacity ?? undefined}
			/>
		{:else if tag === 'rect'}
			<rect
				x={attrs.x}
				y={attrs.y}
				width={attrs.width}
				height={attrs.height}
				rx={attrs.rx ?? undefined}
				stroke={attrs.stroke ?? color}
				stroke-width={attrs.strokeWidth ?? strokeWidth}
				fill={attrs.fill ?? 'none'}
				opacity={attrs.opacity ?? undefined}
			/>
		{/if}
	{/each}
</svg>
