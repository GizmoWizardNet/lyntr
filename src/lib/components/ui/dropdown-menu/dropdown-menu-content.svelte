<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui-old";
	import { cn, flyAndScale } from "$lib/utils.js";

	type $$Props = DropdownMenuPrimitive.ContentProps;
	type $$Events = DropdownMenuPrimitive.ContentEvents;

	interface Props {
		class?: $$Props["class"];
		sideOffset?: $$Props["sideOffset"];
		transition?: $$Props["transition"];
		transitionConfig?: $$Props["transitionConfig"];
		children?: import('svelte').Snippet;
		[key: string]: any
	}

	let {
		class: className = undefined,
		sideOffset = 4,
		transition = flyAndScale,
		transitionConfig = undefined,
		children,
		...rest
	}: Props = $props();
	
</script>

<DropdownMenuPrimitive.Content
	{transition}
	{transitionConfig}
	{sideOffset}
	class={cn(
		"z-50 min-w-[8rem] rounded-[var(--radius-md)] bg-popover p-1 text-popover-foreground font-[family-name:var(--font-retro)] focus:outline-none",
		"border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)]",
		"border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)]",
		"shadow-[var(--hard-shadow)]",
		className
	)}
	{...rest}
	on:keydown
>
	{@render children?.()}
</DropdownMenuPrimitive.Content>
