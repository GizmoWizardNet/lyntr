<script lang="ts">
	import { Accordion as AccordionPrimitive } from "bits-ui-old";
	import { cn } from "$lib/utils.js";

	type $$Props = AccordionPrimitive.ItemProps;

	interface Props {
		class?: $$Props["class"];
		value: $$Props["value"];
		children?: import('svelte').Snippet;
		[key: string]: any
	}

	let { class: className = undefined, value, children, ...rest }: Props = $props();
	
</script>

<AccordionPrimitive.Item {value} class={cn("border-b", className)} {...rest}>
	{@render children?.()}
</AccordionPrimitive.Item>
