<script lang="ts">
	import { RefreshCw } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';

	// Shared between the main feed toolbar and the Scrollables toolbar
	// (same manual-refresh-button + auto-refresh-checkbox pattern in both
	// places) rather than duplicating the timer/localStorage logic twice.
	interface Props {
		onRefresh: () => void;
		// Namespaces the two localStorage keys (enabled + interval) so the
		// main feed and Scrollables remember separate preferences instead
		// of sharing one setting.
		storageKey: string;
		defaultEnabled?: boolean;
		defaultSeconds?: number;
	}

	let { onRefresh, storageKey, defaultEnabled = true, defaultSeconds = 15 }: Props = $props();

	const ENABLED_KEY = `${storageKey}_autorefresh_enabled`;
	const SECONDS_KEY = `${storageKey}_autorefresh_seconds`;
	const MIN_SECONDS = 5;
	const MAX_SECONDS = 300;

	let enabled = $state(defaultEnabled);
	let seconds = $state(defaultSeconds);
	let spinning = $state(false);
	let timer: ReturnType<typeof setInterval> | undefined;

	try {
		const storedEnabled = localStorage.getItem(ENABLED_KEY);
		if (storedEnabled !== null) enabled = storedEnabled === 'true';
		const storedSeconds = Number(localStorage.getItem(SECONDS_KEY));
		if (storedSeconds >= MIN_SECONDS && storedSeconds <= MAX_SECONDS) seconds = storedSeconds;
	} catch {
		// Private browsing / storage disabled — just run with the defaults
		// for this session, same fallback as the Scrollables playback-speed
		// control uses.
	}

	function persist() {
		try {
			localStorage.setItem(ENABLED_KEY, String(enabled));
			localStorage.setItem(SECONDS_KEY, String(seconds));
		} catch {
			/* see above */
		}
	}

	function triggerRefresh(spin = true) {
		onRefresh();
		if (!spin) return;
		spinning = true;
		setTimeout(() => (spinning = false), 500);
	}

	function manualRefresh() {
		triggerRefresh();
		// Manual refresh restarts the countdown rather than letting the
		// next auto-refresh land seconds later — otherwise a manual click
		// right before an auto-tick feels like it did nothing.
		restartTimer();
	}

	function restartTimer() {
		if (timer) clearInterval(timer);
		if (!enabled) return;
		timer = setInterval(() => triggerRefresh(), seconds * 1000);
	}

	function onToggleEnabled() {
		enabled = !enabled;
		persist();
		restartTimer();
	}

	function onSecondsChange(e: Event) {
		const value = Math.round(Number((e.target as HTMLInputElement).value));
		seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, value || defaultSeconds));
		persist();
		restartTimer();
	}

	// Don't burn refresh calls on a hidden/backgrounded tab — pause while
	// hidden, catch up with one refresh + a fresh countdown on return so
	// the feed isn't stale the moment you tab back in.
	function onVisibilityChange() {
		if (document.hidden) {
			if (timer) clearInterval(timer);
		} else if (enabled) {
			triggerRefresh();
			restartTimer();
		}
	}

	onMount(() => {
		document.addEventListener('visibilitychange', onVisibilityChange);
		restartTimer();
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibilityChange);
		}
	});
</script>

<div class="refresh-control">
	<button class="refresh-btn" onclick={manualRefresh} title="Refresh now" aria-label="Refresh now">
		<RefreshCw class="h-4 w-4 {spinning ? 'spin' : ''}" />
	</button>

	<label class="auto-toggle">
		<input type="checkbox" checked={enabled} onchange={onToggleEnabled} />
		<span>Auto</span>
	</label>

	{#if enabled}
		<input
			type="number"
			class="interval-input"
			min={MIN_SECONDS}
			max={MAX_SECONDS}
			value={seconds}
			onchange={onSecondsChange}
			title="Auto-refresh interval, in seconds"
		/>
		<span class="interval-unit">s</span>
	{/if}
</div>

<style>
	.refresh-control {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-retro);
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 4px;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		background: hsl(var(--input));
		box-shadow: var(--inset-shadow);
		color: hsl(var(--foreground));
		cursor: pointer;
	}

	.refresh-btn:active {
		transform: translateY(1px);
	}

	.refresh-btn :global(.spin) {
		animation: spin 0.5s linear;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to   { transform: rotate(360deg); }
	}

	.auto-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		user-select: none;
	}

	.auto-toggle input {
		cursor: pointer;
	}

	.interval-input {
		width: 42px;
		border-radius: 4px;
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		background: hsl(var(--input));
		padding: 3px 4px;
		font-family: inherit;
		font-size: 11px;
		box-shadow: var(--inset-shadow);
		text-align: center;
	}

	.interval-unit {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
</style>
