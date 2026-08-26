<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui-old";
	import { cn, flyAndScale } from "$lib/utils.js";

	type $$Props = PopoverPrimitive.ContentProps;
	interface Props {
		class?: $$Props["class"];
		transition?: $$Props["transition"];
		transitionConfig?: $$Props["transitionConfig"];
		children?: import('svelte').Snippet;
		[key: string]: any
	}

	let {
		class: className = undefined,
		transition = flyAndScale,
		transitionConfig = undefined,
		children,
		...rest
	}: Props = $props();
	
</script>

<PopoverPrimitive.Content
	{transition}
	{transitionConfig}
	class={cn(
		"z-50 w-72 rounded-[var(--radius-md)] bg-popover p-4 text-popover-foreground font-[family-name:var(--font-retro)] outline-none",
		"border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)]",
		"border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)]",
		"shadow-[var(--hard-shadow)]",
		className
	)}
	{...rest}
>
	{@render children?.()}
</PopoverPrimitive.Content>
