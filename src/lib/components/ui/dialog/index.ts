import { Dialog as DialogPrimitive } from "bits-ui-old";
import { withAsChild } from "../bits-ui-old-as-child";

import Title from "./dialog-title.svelte";
import Portal from "./dialog-portal.svelte";
import Footer from "./dialog-footer.svelte";
import Header from "./dialog-header.svelte";
import Overlay from "./dialog-overlay.svelte";
import Content from "./dialog-content.svelte";
import Description from "./dialog-description.svelte";

const Root = DialogPrimitive.Root;
// See bits-ui-old-as-child.ts: bits-ui-old's types never declare `asChild`,
// which every Trigger usage in this app relies on at runtime.
const Trigger = withAsChild(DialogPrimitive.Trigger);
const Close = withAsChild(DialogPrimitive.Close);

export {
	Root,
	Title,
	Portal,
	Footer,
	Header,
	Trigger,
	Overlay,
	Content,
	Description,
	Close,
	//
	Root as Dialog,
	Title as DialogTitle,
	Portal as DialogPortal,
	Footer as DialogFooter,
	Header as DialogHeader,
	Trigger as DialogTrigger,
	Overlay as DialogOverlay,
	Content as DialogContent,
	Description as DialogDescription,
	Close as DialogClose,
};
