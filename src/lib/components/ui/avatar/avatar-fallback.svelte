<script lang="ts">
	import { Avatar as AvatarPrimitive } from "bits-ui-old";
	import { cn } from "$lib/utils.js";

	type $$Props = AvatarPrimitive.FallbackProps;

	interface Props {
		class?: $$Props["class"];
		children?: import('svelte').Snippet;
		[key: string]: any
	}

	let { class: className = undefined, children, ...rest }: Props = $props();
	
</script>

<AvatarPrimitive.Fallback
	class={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
	{...rest}
>
	{@render children?.()}
</AvatarPrimitive.Fallback>
