<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui-old";
	import { buttonVariants } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import { withAsChild } from "../bits-ui-old-as-child";

	type $$Props = AlertDialogPrimitive.CancelProps;
	type $$Events = AlertDialogPrimitive.CancelEvents;

	interface Props {
		class?: $$Props["class"];
		children?: import('svelte').Snippet<[any]>;
		[key: string]: any
	}

	let { class: className = undefined, children, ...rest }: Props = $props();
	

	const children_render = $derived(children);

	// See bits-ui-old-as-child.ts.
	const Cancel = withAsChild(AlertDialogPrimitive.Cancel);
</script>

<Cancel
	class={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
	{...rest}
	on:click
	on:keydown
	
>
	{#snippet children({ builder }: { builder: any })}
		{@render children_render?.({ builder, })}
	{/snippet}
</Cancel>
