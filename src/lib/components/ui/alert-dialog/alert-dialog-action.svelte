<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui-old";
	import { buttonVariants } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import { withAsChild } from "../bits-ui-old-as-child";

	type $$Props = AlertDialogPrimitive.ActionProps;
	type $$Events = AlertDialogPrimitive.ActionEvents;

	interface Props {
		class?: $$Props["class"];
		children?: import('svelte').Snippet<[any]>;
		[key: string]: any
	}

	let { class: className = undefined, children, ...rest }: Props = $props();
	

	const children_render = $derived(children);

	// See bits-ui-old-as-child.ts: this Action component internally uses the
	// same builder-snippet convention as Trigger, without declaring it.
	const Action = withAsChild(AlertDialogPrimitive.Action);
</script>

<Action
	class={cn(buttonVariants(), className)}
	{...rest}
	on:click
	on:keydown
	
>
	{#snippet children({ builder }: { builder: any })}
		{@render children_render?.({ builder, })}
	{/snippet}
</Action>
