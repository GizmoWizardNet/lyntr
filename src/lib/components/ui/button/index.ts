import { type VariantProps, tv } from "tailwind-variants";
import type { Button as ButtonPrimitive } from "bits-ui-old";
import Root from "./button.svelte";

const buttonVariants = tv({
	base: "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] text-sm font-bold font-[family-name:var(--font-retro)] transition-[filter,box-shadow] duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
	variants: {
		variant: {
			// Gloss gradient + chunky bevel, pressed state on click
			default:
				"bg-gradient-gloss text-primary-foreground border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow)] hover:brightness-110 active:brightness-95 active:shadow-[var(--hard-shadow-sm)] active:translate-x-px active:translate-y-px",
			destructive:
				"bg-destructive text-destructive-foreground border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow)] hover:brightness-110 active:brightness-95 active:shadow-[var(--hard-shadow-sm)] active:translate-x-px active:translate-y-px",
			// Raised bevel, no gloss — reads as the "secondary" weight of the same material
			outline:
				"border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] bg-background shadow-[var(--hard-shadow-sm)] hover:bg-accent active:shadow-none active:translate-x-px active:translate-y-px",
			secondary:
				"bg-secondary text-secondary-foreground border-t-[1.5px] border-l-[1.5px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1.5px] border-r-[1.5px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)] hover:brightness-105 active:shadow-none active:translate-x-px active:translate-y-px",
			// Flat until interaction — pressed state sinks INTO the page rather than lifting
			ghost:
				"hover:bg-primary/10 hover:shadow-[var(--inset-shadow)] active:shadow-[var(--inset-shadow)]",
			link: "text-primary underline-offset-4 hover:underline",
		},
		size: {
			default: "h-10 px-4 py-2",
			sm: "h-9 rounded-[var(--radius-sm)] px-3",
			lg: "h-11 rounded-[var(--radius-md)] px-8",
			icon: "h-10 w-10",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "default",
	},
});

type Variant = VariantProps<typeof buttonVariants>["variant"];
type Size = VariantProps<typeof buttonVariants>["size"];

type Props = ButtonPrimitive.Props & {
	variant?: Variant;
	size?: Size;
};

type Events = ButtonPrimitive.Events;

export {
	Root,
	type Props,
	type Events,
	//
	Root as Button,
	type Props as ButtonProps,
	type Events as ButtonEvents,
	buttonVariants,
};
