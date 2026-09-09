<script lang="ts">
	import Avatar from './Avatar.svelte';
	import * as Popover from '@/components/ui/popover';
	import { Button } from '@/components/ui/button';
	import OutlineButton from './OutlineButton.svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { toggleMode, mode } from 'mode-watcher';
	import HugeIcon from './HugeIcon.svelte';
	import PlatformSettings from './PlatformSettings.svelte';
	import DeleteAccountDialog from './DeleteAccountDialog.svelte';
	import { Input } from '@/components/ui/input';
	import { MessageCircle, X } from 'lucide-svelte';

	import {
		Moon01Icon,
		Sun01Icon,
		ShieldCheck,
		Document,
		InformationCircleIcon,
		UserBlock01Icon,
		Logout01Icon,
		Settings01Icon,
		Download01Icon
	} from '@hugeicons/core-free-icons';

	let opened = $state(false);
	let platformSettingsOpen = $state(false);
	let deleteAccountOpen = $state(false);

	let statusOpened = $state(false);
	let statusDraft = $state('');
	let statusDuration = $state<'30m' | '1h' | '4h' | '24h' | '7d' | 'forever'>('forever');
	let statusSaving = $state(false);
	let currentStatusText: string | null = $state(null);
	let statusLoaded = $state(false);

	const DURATION_OPTIONS: { value: typeof statusDuration; label: string }[] = [
		{ value: '30m', label: '30 min' },
		{ value: '1h', label: '1 hour' },
		{ value: '4h', label: '4 hours' },
		{ value: '24h', label: '24 hours' },
		{ value: '7d', label: '7 days' },
		{ value: 'forever', label: 'Forever' }
	];

	async function loadStatus() {
		if (statusLoaded || !userId) return;
		try {
			const res = await fetch('/api/profile/status');
			if (res.ok) {
				const data = await res.json();
				currentStatusText = data.status_text ?? null;
				statusDraft = currentStatusText ?? '';
			}
		} catch {
			// Non-critical — quick-set panel just opens with an empty draft.
		} finally {
			statusLoaded = true;
		}
	}

	async function saveStatus() {
		const text = statusDraft.trim();
		statusSaving = true;
		try {
			const res = await fetch('/api/profile/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					text ? { status_text: text, duration: statusDuration } : { status_text: null }
				)
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error ?? 'Failed to update status.');
				return;
			}
			currentStatusText = data.status_text ?? null;
			toast.success(currentStatusText ? 'Status updated.' : 'Status cleared.');
			statusOpened = false;
		} catch {
			toast.error('Failed to update status.');
		} finally {
			statusSaving = false;
		}
	}

	function clearStatus() {
		statusDraft = '';
		saveStatus();
	}

	interface Props {
		src?: string;
		name?: string;
		handle?: string;
		userId?: string;
	}

	let { src = 'https://github.com/face-hh.png', name = 'Face oifneoangoaen kfpeakfpae', handle = '@facedevstuff', userId = '' }: Props = $props();

	function deleteAllCookies() {
		localStorage.clear();
	}

	function onAccountDeleted() {
		deleteAllCookies();
		goto('/');
		window.location.reload();
	}

	async function logout() {
		const response = await fetch('api/logout', { method: 'POST' });

		if (response.status !== 200)
			return toast.error(
				`Server failed to log you out. Error: ${response.status} | ${response.statusText}`
			);

		deleteAllCookies();
		location.reload();
	}

	let isDark = $derived(mode.current === 'dark');
	let themeLabel = $derived(isDark ? 'Light mode' : 'Dark mode');
	let themeIcon = $derived(isDark ? Sun01Icon : Moon01Icon);
</script>

<Popover.Root bind:open={opened}>
	<Popover.Trigger asChild >
		{#snippet children({ builder }: { builder: any })}
				<button
				{...builder}
				onclick={() => (opened = !opened)}
				class="profile-trigger static bottom-2 flex max-w-md cursor-pointer items-center gap-4 p-4 md:absolute md:w-[250px]"
			>
				<div class="hidden items-center gap-2 md:flex">
					<Avatar size={12} {src} alt="Your profile picture." showPresence={false} />
					<div class="flex flex-col gap-2 overflow-hidden">
						<span class="truncate text-lg font-medium leading-none peer-enabled:cursor-pointer">
							{name}
						</span>
						<span class="text-sm font-medium leading-none text-muted-foreground">
							{handle}
						</span>
					</div>
				</div>
				<!-- Mobile: show settings icon -->
				<HugeIcon icon={Settings01Icon} size={24} className="md:hidden" />
			</button>
					{/snippet}
		</Popover.Trigger>

	<Popover.Content class="w-60">
		<div class="grid gap-4">

			<!-- Dark / Light mode toggle -->
			<button
				onclick={toggleMode}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={themeIcon} size={24} />
				<span>{themeLabel}</span>
			</button>

			<!-- Quick status set — no need to leave this menu -->
			<Popover.Root bind:open={statusOpened}>
				<Popover.Trigger asChild>
					{#snippet children({ builder }: { builder: any })}
						<button
							{...builder}
							onclick={() => {
								statusOpened = !statusOpened;
								if (statusOpened) loadStatus();
							}}
							class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
						>
							<MessageCircle size={24} />
							<span class="truncate">{currentStatusText ? `Status: ${currentStatusText}` : 'Set status'}</span>
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-72" side="right" align="start">
					<div class="flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-bold text-primary">Set your status</span>
							{#if currentStatusText}
								<button
									type="button"
									onclick={clearStatus}
									class="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-red-500"
									disabled={statusSaving}
								>
									<X size={14} />
									Clear
								</button>
							{/if}
						</div>

						<Input
							bind:value={statusDraft}
							placeholder="What's going on?"
							maxlength={100}
							class="text-sm"
						/>

						<div class="flex flex-wrap gap-1.5">
							{#each DURATION_OPTIONS as opt (opt.value)}
								<button
									type="button"
									onclick={() => (statusDuration = opt.value)}
									class="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors {statusDuration ===
									opt.value
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border text-muted-foreground hover:text-primary'}"
								>
									{opt.label}
								</button>
							{/each}
						</div>

						<Button
							size="sm"
							onclick={saveStatus}
							disabled={statusSaving || !statusDraft.trim()}
							class="w-full"
						>
							{statusSaving ? 'Saving...' : 'Save status'}
						</Button>
					</div>
				</Popover.Content>
			</Popover.Root>

			<div class="h-px bg-border"></div>

			<button
				onclick={() => (window.location.href = 'https://discord.gg/y5PA8uS5Tj')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={ShieldCheck} size={24} />
				<span>Verify my account</span>
			</button>

			<button
				onclick={() => goto('/downloads')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={Download01Icon} size={24} />
				<span>Downloads</span>
			</button>

			<button
				onclick={() => goto('/about')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={InformationCircleIcon} size={24} />
				<span>About</span>
			</button>

			<!-- Platform Settings -->
			<button
				onclick={() => { opened = false; platformSettingsOpen = true; }}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={Settings01Icon} size={24} />
				<span>Platform Settings</span>
			</button>

			<!-- Terms of Service -->
			<button
				onclick={() => goto('/tos')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={Document} size={24} />
				<span>Terms of Service</span>
			</button>

			<!-- Privacy Policy -->
			<button
				onclick={() => goto('/privacy')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={ShieldCheck} size={24} />
				<span>Privacy Policy</span>
			</button>

			<div class="h-px bg-border"></div>

			<!-- Delete account -->
			<button
				onclick={() => { opened = false; deleteAccountOpen = true; }}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-red-500 transition-all hover:drop-shadow-[0_0px_12px_rgba(239,68,68,0.6)]"
			>
				<HugeIcon icon={UserBlock01Icon} size={24} color="rgb(239 68 68)" />
				<span>Delete account</span>
			</button>

			<!-- Log out -->
			<button
				onclick={logout}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={Logout01Icon} size={24} />
				<span>Log out</span>
			</button>

		</div>
	</Popover.Content>
</Popover.Root>

<PlatformSettings bind:open={platformSettingsOpen} {userId} />
<DeleteAccountDialog bind:open={deleteAccountOpen} username={name} onDeleted={onAccountDeleted} />