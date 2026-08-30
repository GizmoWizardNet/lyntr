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

	// Hugeicons data — imported from the free icon set.
	// Run: bun add @hugeicons/core-free-icons
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

	interface Props {
		src?: string;
		name?: string;
		handle?: string;
	}

	let { src = 'https://github.com/face-hh.png', name = 'Face oifneoangoaen kfpeakfpae', handle = '@facedevstuff' }: Props = $props();

	function deleteAccount() {
		if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
			fetch('/api/profile', {
				method: 'DELETE'
			})
				.then((response) => {
					if (response.ok) {
						goto('/');
						window.location.reload();
					} else {
						toast.error('Failed to delete account');
					}
				})
				.catch((error) => {
					toast.error('Error:', error);
				});
		}
	}

	function deleteAllCookies() {
		localStorage.clear();
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

	// Reactive: what to show depends on current mode
	// When light → show "Dark mode" option with moon
	// When dark  → show "Light mode" option with sun
	let isDark = $derived(mode.current === 'dark');
	let themeLabel = $derived(isDark ? 'Light mode' : 'Dark mode');
	let themeIcon = $derived(isDark ? Sun01Icon : Moon01Icon);
</script>

<Popover.Root bind:open={opened}>
	<Popover.Trigger asChild >
		{#snippet children({ builder })}
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

			<!-- Dark / Light mode toggle — mobile only. Desktop users can
			     already flip modes via the sun/moon icon in the sidebar. -->
			<button
				onclick={toggleMode}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)] md:hidden"
			>
				<HugeIcon icon={themeIcon} size={24} />
				<span>{themeLabel}</span>
			</button>

			<div class="h-px bg-border md:hidden"></div>

			<!-- Verify my account -->
			<button
				onclick={() => (window.location.href = 'https://discord.gg/y5PA8uS5Tj')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={ShieldCheck} size={24} />
				<span>Verify my account</span>
			</button>

			<!-- Downloads -->
			<button
				onclick={() => goto('/downloads')}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-bold text-primary transition-all hover:drop-shadow-[0_0px_12px_hsl(var(--primary)/0.6)]"
			>
				<HugeIcon icon={Download01Icon} size={24} />
				<span>Downloads</span>
			</button>

			<!-- About -->
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
				onclick={deleteAccount}
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

<PlatformSettings bind:open={platformSettingsOpen} />