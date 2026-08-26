<script lang="ts">
	import type { ComponentType, SvelteComponent } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { createEventDispatcher } from 'svelte';
	import { Label } from '@/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { Heart } from 'lucide-svelte';


	interface Props {
		icon: ComponentType<SvelteComponent>;
		text?: string | undefined;
		secondary?: string | undefined;
		/** Overrides the badge's default bg-primary/50 styling — e.g. for
		 *  Achievements' gold "unseen" badge (bg-amber-500 text-black).
		 *  Was previously accepted by callers (Navigation.svelte) but never
		 *  actually declared or applied here, so it silently did nothing. */
		secondaryClass?: string | undefined;
		strokeWidth?: number;
		className?: string;
		colorOnClick?: boolean;
		outline?: boolean;
		isActive?: boolean;
		popover?: string | null;
		animate?: boolean;
		small?: boolean;
		/** Plays a one-shot lucide-style hover micro-animation, then settles back to the static icon. */
		iconAnim?: string | null;
	}

	let {
		icon,
		text = undefined,
		secondary = undefined,
		secondaryClass = undefined,
		strokeWidth = 2.5,
		className = '',
		colorOnClick = false,
		outline = true,
		isActive = $bindable(false),
		popover = null,
		animate = false,
		small = true,
		iconAnim = null
	}: Props = $props();

	let opened = $state(false);

	function handleClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		opened = !opened;

		if (colorOnClick) {
			isActive = !isActive;
		}

		dispatch('click', event);
	}

	const dispatch = createEventDispatcher();
</script>

<div class="relative flex flex-row justify-between gap-1 {className}">
	{#if popover}
		<Popover.Root bind:open={opened} portal={null}>
			<Popover.Trigger asChild >
				{#snippet children({ builder })}
								{@const SvelteComponent_1 = icon}
				<button
						{...builder}
						class:active={isActive}
						class:animate
						onclick={handleClick}
						class="shit {outline
							? 'p-1.5'
							: ''} inline-flex items-center justify-center rounded-xl font-bold text-primary {className}"
					>
						<span class="nav-icon {iconAnim ? `nav-icon-${iconAnim}` : ''}">
						<SvelteComponent_1 {strokeWidth} class="h-6 w-6 {text ? 'mr-1' : ''}" />
					</span>
						{#if text}
							<span>{text}</span>
						{/if}
					</button>
											{/snippet}
						</Popover.Trigger>
			<Popover.Content class="w-60">
				{@const SvelteComponent_2 = icon}
				<div class="flex items-center justify-center gap-2">
					<SvelteComponent_2 {strokeWidth} class="h-12 w-12" />
					<Label>{popover}</Label>
				</div>
			</Popover.Content>
		</Popover.Root>
	{:else}
		{@const SvelteComponent_3 = icon}
		<button
			class:active={isActive}
			class:animate
			onclick={handleClick}
			class="shit {outline
				? 'p-1.5'
				: ''} inline-flex items-center justify-center gap-1 rounded-xl font-bold text-primary {className}"
		>
			<span class="nav-icon {iconAnim ? `nav-icon-${iconAnim}` : ''}">
				<SvelteComponent_3
					{strokeWidth}
					class="h-6 w-6 {text ? '{!small || isActive ? "hidden md:block" : ""}' : ''}"
				/>
			</span>
			{#if icon === Heart}
				<span>{text}</span>
			{:else if text}
				<span class="hidden md:block {!small || isActive ? '!block' : ''}">{text}</span>
			{/if}
		</button>
	{/if}
	{#if secondary}
		<div
			class="absolute -top-2 right-0 flex h-7 w-7 items-center justify-center rounded-full text-center font-mono md:bottom-0 md:left-4 md:right-auto {secondaryClass ?? 'bg-primary/50'}"
		>
			{secondary}
		</div>
	{/if}
</div>

<style>
	.shit {
		position: relative;
		overflow: hidden;
		transition:
			filter 0.15s ease-in-out,
			box-shadow 0.15s ease-in-out,
			background 0.15s ease-in-out,
			color 0.12s ease-in-out,
			border-color 0.15s ease-in-out;
		border-radius: 999px;
		padding: 6px 12px;
		background: var(--aero-surface);
		border: 1px solid var(--aero-border-top);
		border-bottom-color: var(--aero-border-bottom);
		box-shadow: var(--aero-shadow);
		-webkit-backdrop-filter: blur(var(--aero-blur)) saturate(160%);
		backdrop-filter: blur(var(--aero-blur)) saturate(160%);
	}

	/* Glossy top sheen, the defining Aero trait in the reference
	   screenshots — a soft light gradient sitting over the top half of
	   the button, independent of the (semi-transparent) background color
	   so it reads consistently in both light and dark mode. Layered via
	   ::before rather than a second background-image on .shit itself so
	   .active's own gradient background (below) can coexist with it. */
	.shit::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--aero-shine);
		pointer-events: none;
	}

	.shit:hover {
		filter: none;
		transform: none;
		background: var(--aero-surface-hover);
		box-shadow: var(--aero-shadow-active);
	}

	.shit.active {
		background: linear-gradient(
			to bottom,
			hsl(var(--primary-top)) 0%,
			hsl(var(--primary)) 100%
		);
		color: hsl(var(--primary-foreground));
		border-color: var(--aero-border-top);
		border-bottom-color: rgba(0, 0, 0, 0.3);
		transform: none;
		box-shadow: var(--aero-shadow-active);
	}

	@keyframes popIn {
		0% {
			transform: scale(1) rotate(0deg);
		}
		50% {
			transform: scale(1.2) rotate(3deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
	}

	.animate {
		animation: popIn 0.3s ease-in-out;
	}

	/* Resend-style icon micro-interactions: on hover, the icon plays a
	   short, icon-specific animation once, then — because these keyframes
	   have no forwards fill-mode — automatically settles back to the
	   plain, static lucide icon. Re-entering hover replays it. */
	.nav-icon {
		display: inline-flex;
	}
	.nav-icon :global(svg) {
		transform-origin: 50% 50%;
	}

	:global(.shit:hover) .nav-icon-house :global(svg) {
		animation: navHouse 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-search :global(svg) {
		animation: navSearch 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-bell :global(svg) {
		animation: navBell 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-message :global(svg) {
		animation: navMessage 0.5s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-trophy :global(svg) {
		animation: navTrophy 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-mail :global(svg) {
		animation: navMail 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-inbox :global(svg) {
		animation: navInbox 0.5s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-webhook :global(svg) {
		animation: navWebhook 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-user :global(svg) {
		animation: navUser 0.5s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-plus :global(svg) {
		animation: navPlus 0.5s ease-in-out;
	}

	@keyframes navHouse {
		0% { transform: scale(1) translateY(0); }
		30% { transform: scale(0.85) translateY(2px); }
		60% { transform: scale(1.12) translateY(-2px); }
		100% { transform: scale(1) translateY(0); }
	}
	@keyframes navSearch {
		0% { transform: rotate(0deg) scale(1); }
		25% { transform: rotate(-12deg) scale(1.05); }
		50% { transform: rotate(10deg) scale(1.1); }
		75% { transform: rotate(-6deg) scale(1.05); }
		100% { transform: rotate(0deg) scale(1); }
	}
	@keyframes navBell {
		0%, 100% { transform: rotate(0deg); }
		15% { transform: rotate(-16deg); }
		30% { transform: rotate(14deg); }
		45% { transform: rotate(-10deg); }
		60% { transform: rotate(8deg); }
		75% { transform: rotate(-4deg); }
		90% { transform: rotate(2deg); }
	}
	@keyframes navMessage {
		0% { transform: scale(1) rotate(0deg); }
		35% { transform: scale(1.15) rotate(-6deg); }
		70% { transform: scale(0.95) rotate(4deg); }
		100% { transform: scale(1) rotate(0deg); }
	}
	@keyframes navTrophy {
		0% { transform: scale(1) rotate(0deg); }
		30% { transform: scale(1.2) rotate(-8deg); }
		55% { transform: scale(1.1) rotate(6deg); }
		80% { transform: scale(1.05) rotate(-2deg); }
		100% { transform: scale(1) rotate(0deg); }
	}
	@keyframes navMail {
		0% { transform: translateY(0) rotate(0deg); }
		25% { transform: translateY(-3px) rotate(-4deg); }
		50% { transform: translateY(1px) rotate(3deg); }
		75% { transform: translateY(-1px) rotate(-1deg); }
		100% { transform: translateY(0) rotate(0deg); }
	}
	@keyframes navInbox {
		0% { transform: translateY(0); }
		30% { transform: translateY(-4px); }
		60% { transform: translateY(2px); }
		100% { transform: translateY(0); }
	}
	@keyframes navWebhook {
		0% { transform: rotate(0deg) scale(1); }
		25% { transform: rotate(15deg) scale(1.08); }
		50% { transform: rotate(-12deg) scale(1); }
		75% { transform: rotate(6deg) scale(1.04); }
		100% { transform: rotate(0deg) scale(1); }
	}
	@keyframes navUser {
		0% { transform: scale(1) translateY(0); }
		40% { transform: scale(1.15) translateY(-2px); }
		100% { transform: scale(1) translateY(0); }
	}
	@keyframes navPlus {
		0% { transform: rotate(0deg) scale(1); }
		50% { transform: rotate(90deg) scale(1.15); }
		100% { transform: rotate(0deg) scale(1); }
	}
</style>
