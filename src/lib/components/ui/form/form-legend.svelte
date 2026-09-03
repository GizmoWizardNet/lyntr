<script lang="ts">
	import * as FormPrimitive from "formsnap";
	import { cn } from "$lib/utils.js";

	type $$Props = FormPrimitive.LegendProps;

	interface Props {
		class?: $$Props["class"];
		children?: import('svelte').Snippet<[]>;
		[key: string]: any
	}

	let { class: className = undefined, children, ...rest }: Props = $props();
	

	const children_render = $derived(children);
</script>

<FormPrimitive.Legend
	{...rest}
	class={cn("text-sm font-medium leading-none data-[fs-error]:text-destructive", className)}
	
>
	{@render children_render?.()}
</FormPrimitive.Legend>
