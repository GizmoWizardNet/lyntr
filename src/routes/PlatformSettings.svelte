<script lang="ts">
	import * as Dialog from '@/components/ui/dialog';
	import { Button } from '@/components/ui/button';
	import { Label } from '@/components/ui/label';
	import { Input } from '@/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { Monitor } from 'lucide-svelte';
	import { setMode, resetMode, userPrefersMode } from 'mode-watcher';
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
		userId?: string;
	}

	let { open = $bindable(false), userId = '' }: Props = $props();

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
				customFont = data.custom_font ?? null;
				customFontInput = customFont ?? '';
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

	// ── Custom font ──────────────────────────────────────────────────────
	// Overrides the `--font-retro` CSS variable that every rule in app.css
	// reads from, so one change here re-fonts the whole app. Presets cover
	// the common case with zero typing; the free-text field is what makes
	// "whatever you want" literal — any name gets tried against Google
	// Fonts if it isn't already a system font.
	const FONT_PRESETS = [
		{ label: 'Default (Tahoma)', value: null },
		{ label: 'Nasalization', value: 'Nasalization' },
		{ label: 'Comic Sans MS', value: 'Comic Sans MS' },
		{ label: 'Times New Roman', value: 'Times New Roman' },
		{ label: 'Courier New', value: 'Courier New' },
		{ label: 'Georgia', value: 'Georgia' },
		{ label: 'Impact', value: 'Impact' }
	];
	const SYSTEM_FONTS = new Set([
		'Tahoma', 'Geneva', 'Verdana', 'Arial', 'Helvetica', 'Georgia',
		'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact',
		'Trebuchet MS', 'sans-serif', 'serif', 'monospace'
	]);
	// Fonts that need a specific non-Google-Fonts provider stylesheet.
	// Nasalization isn't on Google Fonts at all — it's served from
	// cdnfonts.com (https://www.cdnfonts.com/nasalization.font) — so it
	// needs its own entry here rather than going through the generic
	// Google Fonts URL builder below. Keyed by the exact font-family name
	// used in `value` above.
	const FONT_PROVIDERS: Record<string, string> = {
		Nasalization: 'https://fonts.cdnfonts.com/css/nasalization-2'
	};
	const FONT_NAME_PATTERN = /^[a-zA-Z0-9 '\-]{1,60}$/;

	let customFont = $state<string | null>(null);
	let customFontInput = $state('');
	let savingFont = $state(false);
	let injectedFontLink: HTMLLinkElement | null = null;

	function applyFontLocally(fontName: string | null) {
		const root = document.documentElement;
		if (!fontName) {
			root.style.removeProperty('--font-retro');
		} else {
			root.style.setProperty('--font-retro', `"${fontName}", Tahoma, Geneva, Verdana, sans-serif`);
		}
		if (injectedFontLink) {
			injectedFontLink.remove();
			injectedFontLink = null;
		}
		if (fontName && !SYSTEM_FONTS.has(fontName)) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href =
				FONT_PROVIDERS[fontName] ??
				`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
			document.head.appendChild(link);
			injectedFontLink = link;
		}
	}


	async function saveFont(fontName: string | null) {
		if (fontName && !FONT_NAME_PATTERN.test(fontName)) {
			toast.error('That font name has characters that aren\'t supported.');
			return;
		}
		savingFont = true;
		try {
			const res = await fetch('/api/platform-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ custom_font: fontName }),
			});
			if (res.ok) {
				customFont = fontName;
				applyFontLocally(fontName);
				toast.success(fontName ? `Font set to "${fontName}".` : 'Font reset to default.');
			} else {
				const data = await res.json().catch(() => ({}));
				toast.error(data.error ?? 'Could not save font.');
			}
		} finally {
			savingFont = false;
		}
	}

	// ── Email notifications ───────────────────────────────────────────────
	// Moved here from the profile-settings page — same server fields
	// (email_notifications_enabled / notification_email on `users`), just a
	// standalone save via PATCH /api/profile instead of being bundled into
	// the big profile-edit form.
	let emailNotifsEnabled = $state(false);
	let emailIsSet = $state(false);
	let emailInput = $state('');
	let removeEmailRequested = $state(false);
	let loadingEmail = $state(true);
	let savingEmail = $state(false);

	async function loadEmailNotifs() {
		if (!userId) {
			loadingEmail = false;
			return;
		}
		loadingEmail = true;
		try {
			const res = await fetch(`/api/profile?id=${encodeURIComponent(userId)}`);
			if (res.ok) {
				const data = await res.json();
				emailNotifsEnabled = data.email_notifications_enabled ?? false;
				emailIsSet = data.notification_email_set ?? false;
			}
		} finally {
			loadingEmail = false;
		}
	}

	function removeEmail() {
		emailInput = '';
		removeEmailRequested = true;
		emailIsSet = false;
	}

	async function saveEmailToggle(nextEnabled: boolean) {
		emailNotifsEnabled = nextEnabled;
		savingEmail = true;
		try {
			const res = await fetch('/api/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email_notifications_enabled: nextEnabled }),
			});
			if (!res.ok) {
				emailNotifsEnabled = !nextEnabled; // roll back
				toast.error('Could not save that setting.');
			}
		} finally {
			savingEmail = false;
		}
	}

	async function saveEmailAddress() {
		if (!removeEmailRequested && !emailInput.trim()) return;
		savingEmail = true;
		try {
			const res = await fetch('/api/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					notification_email: removeEmailRequested ? null : emailInput.trim()
				}),
			});
			if (res.ok) {
				emailIsSet = !removeEmailRequested;
				emailInput = '';
				removeEmailRequested = false;
				toast.success(emailIsSet ? 'Notification email saved.' : 'Notification email removed.');
			} else {
				const data = await res.json().catch(() => ({}));
				toast.error(data.error ?? 'Could not save that email address.');
			}
		} finally {
			savingEmail = false;
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
			loadEmailNotifs();
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Platform Settings</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 py-2">
			<!-- ── Theme ──────────────────────────────────────────────────── -->
			<div class="flex flex-col gap-2 rounded-lg border border-border p-3">
				<span class="text-sm font-semibold">Theme</span>
				<p class="text-xs text-muted-foreground">
					Choose how Lyntr looks on this device.
				</p>
				<div class="theme-grid">
					<button
						type="button"
						class="theme-tile"
						class:selected={userPrefersMode.current === 'system'}
						onclick={resetMode}
					>
						<img src="/system.png" alt="" class="theme-tile-icon" />
						<span class="theme-tile-label">System</span>
					</button>
					<button
						type="button"
						class="theme-tile"
						class:selected={userPrefersMode.current === 'light'}
						onclick={() => setMode('light')}
					>
						<img src="/sun.png" alt="" class="theme-tile-icon" />
						<span class="theme-tile-label">Light</span>
					</button>
					<button
						type="button"
						class="theme-tile"
						class:selected={userPrefersMode.current === 'dark'}
						onclick={() => setMode('dark')}
					>
						<img src="/moon.png" alt="" class="theme-tile-icon" />
						<span class="theme-tile-label">Dark</span>
					</button>
				</div>
			</div>

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

			<!-- ── Custom font ────────────────────────────────────────────── -->
			<div class="flex flex-col gap-2 rounded-lg border border-border p-3">
				<span class="text-sm font-semibold">Font</span>
				<p class="text-xs text-muted-foreground">
					Change Lyntr's font. Pick a preset, or type any font name — non-system fonts are pulled from Google Fonts automatically.
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each FONT_PRESETS as preset}
						<Button
							variant={customFont === preset.value ? 'default' : 'outline'}
							size="sm"
							disabled={savingFont}
							onclick={() => { customFontInput = preset.value ?? ''; saveFont(preset.value); }}
						>
							{preset.label}
						</Button>
					{/each}
				</div>
				<div class="flex gap-2 pt-1">
					<input
						type="text"
						placeholder="Or type any font name, e.g. Pacifico"
						bind:value={customFontInput}
						disabled={savingFont}
						class="flex-1 rounded-[4px] border-t-[1px] border-l-[1px] border-t-[color:var(--bevel-light)] border-l-[color:var(--bevel-light)] border-b-[1px] border-r-[1px] border-b-[color:var(--bevel-dark)] border-r-[color:var(--bevel-dark)] bg-input px-2 py-1.5 text-sm shadow-[var(--inset-shadow)]"
					/>
					<Button
						size="sm"
						disabled={savingFont || !customFontInput.trim()}
						onclick={() => saveFont(customFontInput.trim())}
					>
						Apply
					</Button>
				</div>
			</div>

			<!-- ── Push notifications-->
			<div class="flex flex-col gap-3 rounded-lg border border-border p-3">
				{#if !pushSupported}
					<p class="text-sm text-muted-foreground">
						Push notifications are not supported in this browser. >:)
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

			<!-- ── Email notifications ───────────────────────────────────── -->
			<div class="flex flex-col gap-3 rounded-lg border border-border p-3">
				{#if loadingEmail}
					<p class="text-xs text-muted-foreground">Loading...</p>
				{:else if !userId}
					<p class="text-sm text-muted-foreground">Email notifications aren't available right now.</p>
				{:else}
					<label class="flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={emailNotifsEnabled}
							disabled={savingEmail}
							onchange={(e) => saveEmailToggle((e.currentTarget as HTMLInputElement).checked)}
							class="h-4 w-4"
						/>
						<span>
							<span class="font-semibold">Email notifications</span>
							<span class="text-muted-foreground"> — get notified by email when someone likes, replies, follows, or messages you.</span>
						</span>
					</label>

					{#if emailNotifsEnabled}
						<div class="flex flex-col gap-2">
							<Label for="notification-email">Notification email</Label>

							{#if emailIsSet && !emailInput && !removeEmailRequested}
								<div class="flex items-center gap-2">
									<span class="flex-1 rounded border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground">
										An email address is set. Enter a new one to replace it.
									</span>
									<button
										type="button"
										class="text-xs text-destructive underline underline-offset-2 hover:opacity-80"
										onclick={() => { removeEmail(); saveEmailAddress(); }}
									>
										Remove
									</button>
								</div>
							{:else}
								<div class="flex gap-2">
									<Input
										type="email"
										id="notification-email"
										placeholder={emailIsSet ? 'Enter a new address to replace it\u2026' : 'you@example.com'}
										bind:value={emailInput}
										disabled={savingEmail}
										autocomplete="email"
										class="flex-1"
									/>
									<Button
										size="sm"
										disabled={savingEmail || !emailInput.trim()}
										onclick={saveEmailAddress}
									>
										Save
									</Button>
								</div>
							{/if}

							<span class="text-xs text-muted-foreground">
								Only used for notifications — never shown publicly or shared.
							</span>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<div class="flex justify-end">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.theme-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.theme-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 16px 8px;
		border-radius: 10px;
		font-family: inherit;
		cursor: pointer;
		color: hsl(var(--foreground));
		background: hsl(var(--secondary));
		border-top:    1px solid var(--bevel-light);
		border-left:   1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right:  1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
		transition: filter 0.12s, transform 0.08s;
	}

	.theme-tile:hover {
		filter: brightness(1.1);
	}

	.theme-tile:active {
		transform: scale(0.98);
	}

	.theme-tile-icon {
		width: 22px;
		height: 22px;
		object-fit: contain;
		color: hsl(var(--foreground));
	}

	.theme-tile-label {
		font-size: 13px;
		font-weight: 700;
	}

	.theme-tile.selected {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-top:    1px solid var(--bevel-dark);
		border-left:   1px solid var(--bevel-dark);
		border-bottom: 1px solid var(--bevel-light);
		border-right:  1px solid var(--bevel-light);
		box-shadow: var(--inset-shadow);
	}

	.theme-tile.selected .theme-tile-icon {
		color: hsl(var(--primary-foreground));
	}

	img.theme-tile-icon {
		filter: none;
	}
	.theme-tile.selected img.theme-tile-icon {
		filter: brightness(0) invert(1);
	}
</style>