import { type VariantProps, tv } from "tailwind-variants";
export { default as Badge } from "./badge.svelte";

export const badgeVariants = tv({
	base: "inline-flex select-none items-center rounded-[var(--radius-sm)] px-2.5 py-0.5 text-xs font-bold font-[family-name:var(--font-retro)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
	variants: {
		variant: {
			default:
				"bg-gradient-gloss text-primary-foreground border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] shadow-[var(--hard-shadow-sm)]",
			secondary:
				"bg-secondary text-secondary-foreground border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)]",
			destructive:
				"bg-destructive text-destructive-foreground border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)]",
			outline: "text-foreground border border-border",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

export type Variant = VariantProps<typeof badgeVariants>["variant"];
