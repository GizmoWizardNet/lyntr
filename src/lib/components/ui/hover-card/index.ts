import { LinkPreview as HoverCardPrimitive } from "bits-ui-old";
import { withAsChild } from "../bits-ui-old-as-child";

import Content from "./hover-card-content.svelte";
const Root = HoverCardPrimitive.Root;
// See bits-ui-old-as-child.ts: bits-ui-old's types never declare `asChild`,
// which every Trigger usage in this app relies on at runtime.
const Trigger = withAsChild(HoverCardPrimitive.Trigger);

export {
	Root,
	Content,
	Trigger,
	Root as HoverCard,
	Content as HoverCardContent,
	Trigger as HoverCardTrigger,
};
