<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	import '../../app.css';

	import { onMount } from 'svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import Auth from '../Auth.svelte';
	import AccountCreator from '../AccountCreator.svelte';
	import { page } from '$app/stores';
	import MainPage from '../MainPage.svelte';
	import Cookies from 'js-cookie';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// data.user comes from the root +layout.server.ts (SSR'd from the
	// session cookie) — same as the homepage, this skips the loading
	// spinner and the client-side /api/me round trip on first paint.
	let authenticated: boolean = $state(!!data.user);
	let noAccount: boolean = $state(false);
	let userData = $state(
		data.user
			? {
					username: data.user.username,
					handle: data.user.handle,
					created_at: String(data.user.created_at),
					iq: data.user.iq,
					id: data.user.id
				}
			: { username: '', handle: '', created_at: '', iq: 90, id: '' }
	);

	// Only remaining client-side case: mid-OAuth-signup, where a temp
	// cookie exists but there's no user row yet (so SSR correctly saw
	// no session and no auth cookie). Nothing to fetch — just flips the
	// branch to AccountCreator instead of the login screen.
	onMount(() => {
		if (!data.user && (Cookies.get('temp-discord-token') || Cookies.get('temp-google-token'))) {
			authenticated = true;
			noAccount = true;
		}
	});

	let handle = $derived(($page.params.handle ?? '').replace(/^@/, ''));
</script>

<ModeWatcher defaultMode={'light'} />

<Toaster />

{#if !authenticated}
	<Auth />
{:else if noAccount}
	<AccountCreator />
{:else}
	<MainPage {...userData} profileOpened={handle} />
{/if}
