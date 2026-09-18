<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import '../../app.css';

	import { goto } from '$app/navigation';
	import { Toaster } from '$lib/components/ui/sonner';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { ArrowLeft } from 'lucide-svelte';
	import { mode } from 'mode-watcher';

	import Navigation from '../Navigation.svelte';
	import PostButton from '../PostButton.svelte';
	import ProfileButton from '../ProfileButton.svelte';
	import AboutContent from '../AboutContent.svelte';
	import { cdnUrl } from '../stores';
	import type { PageData } from './$types';

	// `data.user` comes from the root +layout.server.ts — resolved
	// server-side from the session cookie, so there's no loading state
	// and no client-side /api/me round trip needed here at all.
	let { data }: { data: PageData } = $props();
	let authenticated = $derived(!!data.user);
	let userData = $derived(
		data.user
			? { username: data.user.username, handle: data.user.handle, id: data.user.id }
			: { username: '', handle: '', id: '' }
	);
</script>

<svelte:head>
	<title>About — Lyntr</title>
</svelte:head>

<ModeWatcher defaultMode={'light'} />
<Toaster />

{#if !authenticated}
	<!-- Guests: a plain, standalone page — no sidebar, no login wall. -->
	<div class="min-h-dvh w-full">
		<div class="border-border flex items-center gap-3 border-b px-4 py-3">
			<Button variant="outline" size="sm" class="gap-1.5" onclick={() => goto('/')}>
				<ArrowLeft class="h-4 w-4" />
				Back to Home
			</Button>
			<span class="text-muted-foreground text-sm font-medium">About</span>
		</div>
		<AboutContent />
	</div>
{:else}
	<!-- Logged-in users: same app shell as every other page. -->
	<div class="flex w-full justify-center">
		<div class="w-full max-w-[1400px]">
			<div class="flex h-dvh w-full flex-col overflow-hidden md:flex-row">
				<div class="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background md:static md:border-t-0 md:bg-transparent">
					<div class="md:max-w-1/3 flex w-full flex-row items-start gap-2 px-2 py-2 md:w-auto md:flex-col md:pt-0">
						<button class="mt-5 hidden md:block" onclick={() => goto('/')}>
							<img
								class="mb-5 size-20"
								src={mode.current === 'dark' ? 'logo_dark.svg' : 'logo_light.svg'}
								alt="Logo"
							/>
						</button>
						<Navigation handle={userData.handle} id={userData.id} />
						<div class="hidden md:flex md:w-full md:flex-col">
							<PostButton userId={userData.id} />
							<ProfileButton
								src={cdnUrl(userData.id, 'medium')}
								name={userData.username}
								handle="@{userData.handle}"
							/>
						</div>
					</div>
					<Separator class="h-[1px] w-full md:h-full md:w-[1px]" />
				</div>

				<div class="h-full w-full overflow-y-auto pb-[60px] md:pb-0">
					<AboutContent />
				</div>
			</div>
		</div>
	</div>
{/if}
