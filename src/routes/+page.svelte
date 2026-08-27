<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';
	import { onMount } from 'svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import Auth from './Auth.svelte';
	import Landing from './Landing.svelte';
	import AccountCreator from './AccountCreator.svelte';
	import MainPage from './MainPage.svelte';
	import WorkingOverlay from './WorkingOverlay.svelte';
	import Cookies from 'js-cookie';
	import { unreadMessages } from './stores';
	import type { PageData } from './$types';

	let authenticated: boolean = $state(false);
	let loading: boolean = $state(true);
	let noAccount: boolean = $state(false);
	let userData = $state({
		username: '',
		handle: '',
		created_at: '',
		iq: 90,
		id: ''
	});

	// Small, common system fonts don't need a Google Fonts fetch — anything
	// else gets loaded from Google Fonts on the fly, which is what makes
	// "type literally any font name" work instead of only supporting a
	// fixed list of presets.
	const SYSTEM_FONTS = new Set([
		'Tahoma', 'Geneva', 'Verdana', 'Arial', 'Helvetica', 'Georgia',
		'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact',
		'Trebuchet MS', 'sans-serif', 'serif', 'monospace'
	]);

	let injectedFontLink: HTMLLinkElement | null = null;

	function applyCustomFont(fontName: string | null | undefined) {
		const root = document.documentElement;
		if (!fontName) {
			root.style.removeProperty('--font-retro');
			if (injectedFontLink) {
				injectedFontLink.remove();
				injectedFontLink = null;
			}
			return;
		}

		root.style.setProperty('--font-retro', `"${fontName}", Tahoma, Geneva, Verdana, sans-serif`);

		if (injectedFontLink) injectedFontLink.remove();
		if (!SYSTEM_FONTS.has(fontName)) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
			document.head.appendChild(link);
			injectedFontLink = link;
		} else {
			injectedFontLink = null;
		}
	}

	// Holds the freshly-created account's data between the 'registered' and
	// 'login' events fired by AccountCreator, so we can skip the /api/me
	// round-trip and drop the user straight into the app.
	let pendingUserData: any = $state(null);

	async function checkAuthAndProfileStatus() {
		// Either OAuth temp token means the user just came back from an OAuth
		// flow for an account that doesn't have a profile yet (brand-new
		// signup — the real session cookie isn't set until registration
		// completes, so this is the only signal available in that window).
		const midOAuthSignup = !!(Cookies.get('temp-discord-token') || Cookies.get('temp-google-token'));
		if (midOAuthSignup) {
			authenticated = true;
		}

		if (localStorage.getItem('user-data')) {
			try {
				const data = JSON.parse(localStorage.getItem('user-data')!);
				loading = false;
				noAccount = false;
				userData = data;
				authenticated = true;
			} catch (error) {
				console.error('Failed to load user data from cache', error);
			}
		}

		try {
			const loginResponse = await fetch(`api/me`, {
				method: 'GET',
				credentials: 'include'
			});

			if (loginResponse.status === 200) {
				const res = await loginResponse.json();
				userData = {
					username:   res.username,
					handle:     res.handle,
					created_at: res.created_at,
					iq:         res.iq,
					id:         res.id,
					default_feed: res.default_feed,
					custom_font: res.custom_font
				};
				localStorage.setItem('user-data', JSON.stringify(userData));
				noAccount = false;
				// This was the core bug behind "very jank" login: `authenticated`
				// was previously only ever set true by the transient OAuth cookie
				// above or a stale localStorage cache — never by an actual
				// successful session check. Any returning visit without a fresh
				// OAuth cookie and without (or with cleared) cached user-data —
				// e.g. right after logging out and back in as someone else —
				// left `authenticated` false forever, stranding a genuinely
				// logged-in session on the landing page.
				authenticated = true;
			} else {
				noAccount = true;
				// A real, non-mid-signup session check failed — don't leave
				// `authenticated` true from stale cached data above; that
				// combination (authenticated=true + noAccount=true) incorrectly
				// dropped a truly logged-out user straight into AccountCreator
				// instead of the login screen.
				if (!midOAuthSignup) authenticated = false;
			}
		} catch (error) {
			console.error('Error checking user status:', error);
			noAccount = true;
			if (!midOAuthSignup) authenticated = false;
		}

		loading = false;
	}

	onMount(() => {
		checkAuthAndProfileStatus();
	});

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Discord-style responsive tab title: prefix with "(N)" while there are
	// unread notifications, drop the prefix once they're all read. This runs
	// client-side and overwrites whatever <svelte:head><title> rendered, so
	// it stays in sync as $unreadMessages changes without fighting SvelteKit's
	// head management.
	$effect(() => {
		const baseTitle = data.lynt ? `${data.lynt.username} on Lyntr` : 'Lyntr';
		document.title = $unreadMessages > 0 ? `(${$unreadMessages}) ${baseTitle}` : baseTitle;
	});

	// Applies as soon as userData is populated (from /api/me on load, from
	// cached localStorage on repeat visits, or after AccountCreator hands
	// off a fresh account) and again whenever it's changed live from
	// PlatformSettings — same pattern as the tab-title effect above.
	$effect(() => {
		applyCustomFont((userData as any).custom_font);
	});

</script>

<ModeWatcher defaultMode={'light'} />
<Toaster />
<WorkingOverlay />

{#if loading}
	<LoadingSpinner />
{:else if !authenticated}
	<Landing feed={data.publicFeed} scrollables={data.publicScrollables} />
{:else if noAccount}
	<AccountCreator
		on:registered={(e) => { pendingUserData = e.detail; }}
		on:login={() => {
			if (pendingUserData) {
				localStorage.setItem('user-data', JSON.stringify(pendingUserData));
				userData = pendingUserData;
			}
			noAccount = false;
			authenticated = true;
		}}
	/>
{:else}
	<MainPage {...userData} lyntOpened={data.lyntOpened} />
{/if}

<svelte:head>
	{#if data.lynt && data.og}
		<title>{data.lynt.username} on Lyntr</title>
		<meta property="og:title" content={data.og.title} />
		<meta property="og:site_name" content="Lyntr" />
		<meta content="#3d1f00" name="theme-color" />

		<!-- Twitter / X large card -->
		<meta name="twitter:card"  content="summary_large_image" />
		<meta name="twitter:site"  content="@lyntr" />
		<meta name="twitter:title" content={data.og.title} />
		<meta name="twitter:image" content={data.og.image} />
		<meta name="twitter:description" content={data.og.description} />

		<!-- Open Graph -->
		<meta property="og:type"        content="article" />
		<meta property="og:image"       content={data.og.image} />
		<meta property="og:url"         content="https://lyntr.gizmowizard.tech/?id={data.lynt.id}" />
		<meta property="og:description" content={data.og.description} />
		<meta name="description"        content={data.og.description} />
	{:else}
		<title>Lyntr</title>
		<meta property="og:title"        content="Lyntr — micro-blogging for EVERYONE, for FUN! With a twist." />
		<meta property="og:description"  content="Join Lyntr, earn badges, create threads in forums, customize your profile, and SO MUCH MORE!" />
		<meta property="og:image"        content="https://lyntr.gizmowizard.tech/og-default.png" />
		<meta property="og:image:width"  content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card"        content="summary_large_image" />
	{/if}
</svelte:head>