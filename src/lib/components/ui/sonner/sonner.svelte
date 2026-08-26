<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import { mode } from "mode-watcher";
	interface Props {
		[key: string]: any
	}

	let { ...rest }: Props = $props();

	type $$Props = SonnerProps;
</script>

<Sonner
	theme={mode.current}
	class="toaster group"
	position="bottom-right"
	gap={8}
	toastOptions={{
		classes: {
			toast: [
				// Base shell — tactile card
				"group toast",
				"!rounded-[var(--radius-lg)]",
				"!border",
				"!shadow-[0_12px_32px_-4px_rgba(60,30,0,0.18)]",
				"!font-[Inter,sans-serif]",
				"!text-[0.875rem]",
				"!py-[10px] !px-[14px]",
				// Bevel top highlight
				"before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[1.5px] before:rounded-t-[8px] before:bg-white/40 before:pointer-events-none",
				"relative overflow-hidden",
			].join(" "),
			title:       "!font-[Work_Sans,sans-serif] !font-semibold !text-[0.875rem]",
			description: "!text-[0.8rem] !opacity-80",
			// ── Success ──
			success: [
				"!bg-[#f0faf4]",
				"!border-[#6bcf96]/50",
				"!text-[#0d5c2e]",
				"!shadow-[inset_0_2px_4px_rgba(0,80,30,0.08),0_12px_32px_-4px_rgba(0,80,30,0.15)]",
			].join(" "),
			// ── Error ──
			error: [
				"!bg-[#fff5f5]",
				"!border-[#fc8181]/50",
				"!text-[#7f1d1d]",
				"!shadow-[inset_0_2px_4px_rgba(120,0,0,0.08),0_12px_32px_-4px_rgba(120,0,0,0.15)]",
			].join(" "),
			// ── Warning ──
			warning: [
				"!bg-[#fffbeb]",
				"!border-[#f6c347]/50",
				"!text-[#78350f]",
				"!shadow-[inset_0_2px_4px_rgba(120,80,0,0.08),0_12px_32px_-4px_rgba(120,80,0,0.15)]",
			].join(" "),
			// ── Info (default plain toast) ──
			info: [
				"!bg-[hsl(var(--card))]",
				"!border-[hsl(var(--border))]",
				"!text-[hsl(var(--foreground))]",
				"!shadow-[inset_0_2px_4px_rgba(60,30,0,0.08),0_12px_32px_-4px_rgba(60,30,0,0.12)]",
			].join(" "),
			// ── Loading ──
			loading: [
				"!bg-[hsl(var(--muted))]",
				"!border-[hsl(var(--border))]",
				"!text-[hsl(var(--foreground))]",
			].join(" "),
			actionButton: "!bg-[hsl(var(--primary))] !text-[hsl(var(--primary-foreground))] !rounded-[var(--radius-sm)] !text-[0.8rem] !font-semibold",
			cancelButton:  "!bg-[hsl(var(--muted))] !text-[hsl(var(--muted-foreground))] !rounded-[var(--radius-sm)] !text-[0.8rem]",
			icon: "!mt-[1px]",
		},
	}}
	{...rest}
/>
