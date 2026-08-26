<script lang="ts">
	import * as Dialog from '@/components/ui/dialog';
	import { Button } from '@/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import {
		isPushSupported,
		subscribeToPush,
		unsubscribeFromPush,
		getCurrentSubscription,
		getPermissionState,
		resyncSubscription
	} from '$lib/push-client';

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	// ── Default feed ──────────────────────────────────────────────────────
	const FEED_OPTIONS = ['For you', 'New', 'Following', 'Bookmarked'];
	let defaultFeed = $state('For you');
	let loadingFeed = $state(true);
	let savingFeed = $state(false);

	async function loadDefaultFeed() {
		loadingFeed = true;
		try {
			const res = await fetch('/api/platform-settings');
			if (res.ok) {
				const data = await res.json();
				defaultFeed = data.default_feed ?? 'For you';
			}
		} finally {
			loadingFeed = false;
		}
	}

	async function saveDefaultFeed() {
		savingFeed = true;
		try {
			const res = await fetch('/api/platform-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ default_feed: defaultFeed }),
			});
			if (res.ok) {
				toast.success(`Default feed set to "${defaultFeed}".`);
			} else {
				toast.error('Could not save default feed.');
			}
		} finally {
			savingFeed = false;
		}
	}

	// ── Push notifications ──────────────────────────────────────────────
	let pushSupported = $state(false);
	let pushEnabled = $state(false);
	let pushPermission = $state<NotificationPermission | 'unsupported'>('unsupported');
	let pushWorking = $state(false);

	async function initPush() {
		pushSupported = await isPushSupported();
		pushPermission = getPermissionState();
		const sub = await getCurrentSubscription();
		pushEnabled = !!sub;

		// Self-heal: if the browser has a live subscription, make sure the
		// server actually has a matching row for it. Cheap and idempotent
		// (upsert on user+endpoint) — this is what makes "not persisting"
		// bugs recover on their own instead of requiring a manual
		// unsubscribe/resubscribe.
		if (sub) resyncSubscription(sub);
	}

	async function togglePush() {
		if (pushWorking) return;
		pushWorking = true;
		try {
			if (pushEnabled) {
				const ok = await unsubscribeFromPush();
				if (ok) {
					pushEnabled = false;
				} else {
					toast.error('Could not unsubscribe on this device.');
				}
			} else {
				const result = await subscribeToPush();
				if (result === 'subscribed') {
					pushEnabled = true;
					pushPermission = 'granted';
				} else if (result === 'denied') {
					pushPermission = 'denied';
				} else {
					// Was silently swallowed before — this is the actual
					// "not persisting" case: the browser-level subscribe
					// can succeed while the server save fails, and without
					// this toast the person has no way to know it didn't
					// actually take.
					toast.error('Could not enable push notifications. Please try again.');
				}
			}
		} finally {
			pushWorking = false;
		}
	}

	onMount(() => {
		initPush();
	});

	// Re-check every time the dialog opens, not just on first mount — the
	// person may have toggled OS/browser notification permissions in
	// another tab or in system settings since this component last mounted.
	$effect(() => {
		if (open) {
			loadDefaultFeed();
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Platform Settings</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 py-2">
			<!-- ── Default feed ──────────────────────────────────────────── -->
			<div class="flex flex-col gap-2 rounded-lg border border-border p-3">
				<span class="text-sm font-semibold">Default feed</span>
				<p class="text-xs text-muted-foreground">
					Which tab you land on after logging in, instead of always starting on For You.
				</p>
				{#if loadingFeed}
					<p class="text-xs text-muted-foreground">Loading...</p>
				{:else}
					<select
						bind:value={defaultFeed}
						onchange={saveDefaultFeed}
						disabled={savingFeed}
						class="rounded-[4px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] bg-input px-2 py-1.5 text-sm shadow-[var(--inset-shadow)]"
					>
						{#each FEED_OPTIONS as opt}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{/if}
			</div>

			<!-- ── Push notifications ────────────────────────────────────── -->
			<div class="flex flex-col gap-3 rounded-lg border border-border p-3">
				{#if !pushSupported}
					<p class="text-sm text-muted-foreground">
						Push notifications are not supported in this browser.
					</p>
				{:else if pushPermission === 'denied'}
					<p class="text-sm text-muted-foreground">
						Push notifications are blocked. To enable them, open your browser's site permissions and allow notifications for Lyntr, then reload.
					</p>
				{:else}
					<label class="flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={pushEnabled}
							disabled={pushWorking}
							onchange={togglePush}
							class="h-4 w-4"
						/>
						<span>
							<span class="font-semibold">Push notifications</span>
							<span class="text-muted-foreground"> — get native notifications for this session for new activity.</span>
						</span>
					</label>
					{#if pushWorking}
						<p class="text-xs text-muted-foreground">Working...</p>
					{:else if pushEnabled}
						<p class="text-xs text-muted-foreground">
							This device is subscribed. Untick to stop receiving notifications here.
						</p>
					{/if}
				{/if}
			</div>
		</div>

		<div class="flex justify-end">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
