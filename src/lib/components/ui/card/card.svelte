<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "$lib/utils.js";

	type $$Props = HTMLAttributes<HTMLDivElement>;

	interface Props {
		class?: $$Props["class"];
		children?: import('svelte').Snippet;
		[key: string]: any
	}

	let { class: className = undefined, children, ...rest }: Props = $props();
	
</script>

<div
	class={cn(
		"rounded-[var(--radius-md)] bg-card text-card-foreground font-[family-name:var(--font-retro)]",
		"border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)]",
		"border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)]",
		"shadow-[var(--hard-shadow-sm)]",
		className
	)}
	{...rest}
>
	{@render children?.()}
</div>
