<script lang="ts">
	// A minimal Svelte 4-compatible renderer for @hugeicons/core-free-icons icon data.
	// The official @hugeicons/svelte requires Svelte 5, so we render the icon tuples ourselves.
	//
	// Usage:
	//   import { Moon01Icon } from '@hugeicons/core-free-icons';
	//   import HugeIcon from './HugeIcon.svelte';
	//   <HugeIcon icon={Moon01Icon} size={24} />

	
	interface Props {
		// Icon data is an array of [tagName, attrs] tuples. The upstream
		// @hugeicons/core-free-icons package types attr values as
		// `string | number` (e.g. numeric opacity/stroke-width values), so we
		// mirror that here instead of the narrower `Record<string, string>`
		// which caused type errors at every call site.
		icon: readonly (readonly [string, { readonly [key: string]: string | number }])[];
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

	// SVG attributes require strings; the underlying icon data can carry
	// numeric values (e.g. opacity: 1), so normalize everything to string here
	// rather than at every call site.
	function str(value: string | number | undefined): string | undefined {
		return value === undefined ? undefined : String(value);
	}

	const LINECAPS = new Set(['butt', 'round', 'square', 'inherit']);
	const LINEJOINS = new Set(['miter', 'round', 'bevel', 'arcs', 'miter-clip', 'inherit']);

	function linecap(value: string | number | undefined) {
		const v = str(value);
		return v && LINECAPS.has(v) ? (v as 'butt' | 'round' | 'square' | 'inherit') : undefined;
	}

	function linejoin(value: string | number | undefined) {
		const v = str(value);
		return v && LINEJOINS.has(v)
			? (v as 'miter' | 'round' | 'bevel' | 'arcs' | 'miter-clip' | 'inherit')
			: undefined;
	}
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
				d={str(attrs.d)}
				stroke={str(attrs.stroke) ?? color}
				stroke-width={attrs.strokeWidth ?? strokeWidth}
				stroke-linecap={linecap(attrs.strokeLinecap)}
				stroke-linejoin={linejoin(attrs.strokeLinejoin)}
				fill={str(attrs.fill) ?? 'none'}
				opacity={attrs.opacity}
			/>
		{:else if tag === 'circle'}
			<circle
				cx={attrs.cx}
				cy={attrs.cy}
				r={attrs.r}
				stroke={str(attrs.stroke) ?? color}
				stroke-width={attrs.strokeWidth ?? strokeWidth}
				fill={str(attrs.fill) ?? 'none'}
				opacity={attrs.opacity}
			/>
		{:else if tag === 'rect'}
			<rect
				x={attrs.x}
				y={attrs.y}
				width={attrs.width}
				height={attrs.height}
				rx={attrs.rx}
				stroke={str(attrs.stroke) ?? color}
				stroke-width={attrs.strokeWidth ?? strokeWidth}
				fill={str(attrs.fill) ?? 'none'}
				opacity={attrs.opacity}
			/>
		{/if}
	{/each}
</svg>
