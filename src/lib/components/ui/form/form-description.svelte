<script lang="ts">
	import * as FormPrimitive from "formsnap";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "$lib/utils.js";

	type $$Props = HTMLAttributes<HTMLSpanElement>;
	interface Props {
		class?: string | undefined | null;
		children?: import('svelte').Snippet<[]>;
		[key: string]: any
	}

	let { class: className = undefined, children, ...rest }: Props = $props();
	

	const children_render = $derived(children);
</script>

<FormPrimitive.Description
	class={cn("text-sm text-muted-foreground", className)}
	{...rest}
	
>
	{@render children_render?.()}
</FormPrimitive.Description>
