<script lang="ts">
	import { run } from 'svelte/legacy';

	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { mode } from 'mode-watcher';

	const dispatch = createEventDispatcher<{ token: string; error: void; expired: void }>();

	interface Props {
		token?: string;
	}

	let { token = $bindable('') }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let widgetId: string | null = $state(null);

	// Turnstile injects window.turnstile via its script tag.
	// We call render() once the script is ready.
	function render() {
		if (!container || !(window as any).turnstile) return;
		if (widgetId !== null) return; // already rendered

		widgetId = (window as any).turnstile.render(container, {
			sitekey:  PUBLIC_TURNSTILE_SITE_KEY,
			theme:    mode.current === 'dark' ? 'dark' : 'light',
			callback: (t: string) => {
				token = t;
				dispatch('token', t);
			},
			'error-callback': () => {
				token = '';
				dispatch('error');
			},
			'expired-callback': () => {
				token = '';
				dispatch('expired');
			},
		});
	}

	onMount(() => {
		if ((window as any).turnstile) {
			render();
		} else {
			// Poll until the Turnstile script (loaded in app.html) is ready
			const poll = setInterval(() => {
				if ((window as any).turnstile) {
					clearInterval(poll);
					render();
				}
			}, 100);
		}
	});

	onDestroy(() => {
		if (widgetId !== null && (window as any).turnstile) {
			(window as any).turnstile.remove(widgetId);
		}
	});

	// Re-render if theme changes
	run(() => {
		if (container && (window as any).turnstile && widgetId !== null) {
			(window as any).turnstile.remove(widgetId);
			widgetId = null;
			render();
		}
	});
</script>

<div bind:this={container} class="turnstile-wrap"></div>

<style>
	.turnstile-wrap {
		display: flex;
		justify-content: center;
		margin: 6px 0;
	}
</style>
