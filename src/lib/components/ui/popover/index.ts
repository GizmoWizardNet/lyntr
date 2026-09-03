import { Popover as PopoverPrimitive } from "bits-ui-old";
import { withAsChild } from "../bits-ui-old-as-child";
import Content from "./popover-content.svelte";
const Root = PopoverPrimitive.Root;

// bits-ui-old's own TypeScript definitions never declare `asChild` (a
// melt-ui "render as child, forward the builder action/attrs via a
// {#snippet children({ builder })}" convention) even though every Trigger
// usage in this codebase relies on it at runtime. See bits-ui-old-as-child.ts.
const Trigger = withAsChild(PopoverPrimitive.Trigger);
const Close = withAsChild(PopoverPrimitive.Close);

export {
	Root,
	Content,
	Trigger,
	Close,
	//
	Root as Popover,
	Content as PopoverContent,
	Trigger as PopoverTrigger,
	Close as PopoverClose,
};
