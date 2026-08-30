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

	const INLINE_ANIMATED = new Set(['house', 'webhook', 'user']);
</script>

{#snippet inlineAnimatedIcon(anim: string, cls: string)}
	{#if anim === 'house'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={cls}>
			<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
			<path class="draw-path house-door" pathLength="1" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
		</svg>
	{:else if anim === 'webhook'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={cls}>
			<path class="draw-path webhook-path-1" pathLength="1" d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
			<path class="draw-path webhook-path-2" pathLength="1" d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
			<path class="draw-path webhook-path-3" pathLength="1" d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
		</svg>
	{:else if anim === 'user'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" class={cls}>
			<circle class="draw-path user-circle" pathLength="1" cx="12" cy="8" r="5" />
			<path class="draw-path user-body" pathLength="1" d="M20 21a8 8 0 0 0-16 0" />
		</svg>
	{/if}
{/snippet}

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
						{#if iconAnim && INLINE_ANIMATED.has(iconAnim)}
							{@render inlineAnimatedIcon(iconAnim, `h-6 w-6 ${text ? 'mr-1' : ''}`)}
						{:else}
							<SvelteComponent_1 {strokeWidth} class="h-6 w-6 {text ? 'mr-1' : ''}" />
						{/if}
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
				{#if iconAnim && INLINE_ANIMATED.has(iconAnim)}
					{@render inlineAnimatedIcon(iconAnim, `h-6 w-6 ${text ? '{!small || isActive ? "hidden md:block" : ""}' : ''}`)}
				{:else}
					<SvelteComponent_3
						{strokeWidth}
						class="h-6 w-6 {text ? '{!small || isActive ? "hidden md:block" : ""}' : ''}"
					/>
				{/if}
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

	.shit::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--aero-shine);
		pointer-events: none;
	}

	.shit:hover {
		filter: none;
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
	.nav-icon {
		display: inline-flex;
	}
	.nav-icon :global(svg) {
		transform-origin: 50% 50%;
	}

	.draw-path {
		stroke-dasharray: 1;
		stroke-dashoffset: 0;
	}

	:global(.shit:hover) .nav-icon-house .house-door {
		animation: drawIn 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-webhook .webhook-path-1 {
		animation: drawIn 0.3s ease-out;
	}
	:global(.shit:hover) .nav-icon-webhook .webhook-path-2 {
		animation: drawIn 0.3s ease-out 0.05s backwards;
	}
	:global(.shit:hover) .nav-icon-webhook .webhook-path-3 {
		animation: drawIn 0.3s ease-out 0.1s backwards;
	}
	:global(.shit:hover) .nav-icon-user .user-circle {
		animation: drawInScale 0.35s ease-out;
	}
	:global(.shit:hover) .nav-icon-user .user-body {
		animation: drawIn 0.4s ease-out 0.2s backwards;
	}

	:global(.shit:hover) .nav-icon-search :global(svg) {
		animation: navSearch 1s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	:global(.shit:hover) .nav-icon-bell :global(svg) {
		animation: navBell 0.5s ease-in-out;
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
	:global(.shit:hover) .nav-icon-megaphone :global(svg) {
		animation: navMegaphone 0.5s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-award :global(svg) {
		animation: navTrophy 0.6s ease-in-out;
	}
	:global(.shit:hover) .nav-icon-clapperboard :global(svg) {
		animation: navMessage 0.5s ease-in-out;
	}

	@keyframes drawIn {
		0% { stroke-dashoffset: 1; opacity: 0; }
		30% { opacity: 1; }
		100% { stroke-dashoffset: 0; opacity: 1; }
	}
	/* Same, plus the circle's own scale:[0.5,1] pop from its source. */
	@keyframes drawInScale {
		0% { stroke-dashoffset: 1; opacity: 0; transform: scale(0.5); }
		30% { opacity: 1; }
		100% { stroke-dashoffset: 0; opacity: 1; transform: scale(1); }
	}

	/* lucide-animated's search: x:[0,0,-3,0], y:[0,-4,0,0] over four
	   evenly-spaced keyframes (Motion's default when no explicit `times`
	   is given) — a little hop up, then a dab to the lower-left. */
	@keyframes navSearch {
		0% { transform: translate(0, 0); }
		33% { transform: translate(0, -4px); }
		66% { transform: translate(-3px, 0); }
		100% { transform: translate(0, 0); }
	}
	/* lucide-animated's bell: rotate:[0,-10,10,-10,0], five evenly-spaced
	   keyframes (0/25/50/75/100%). */
	@keyframes navBell {
		0%, 100% { transform: rotate(0deg); }
		25% { transform: rotate(-10deg); }
		50% { transform: rotate(10deg); }
		75% { transform: rotate(-10deg); }
	}
	@keyframes navMessage {
		0% { transform: scale(1) rotate(0deg); }
		25% { transform: scale(1.05) rotate(-7deg); }
		60% { transform: scale(1.05) rotate(7deg); }
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
	@keyframes navMegaphone {
		0% { transform: rotate(0deg) scale(1); }
		25% { transform: rotate(-8deg) scale(1.05); }
		60% { transform: rotate(6deg) scale(1.08); }
		100% { transform: rotate(0deg) scale(1); }
	}
</style>