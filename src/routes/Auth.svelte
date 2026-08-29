<script lang="ts">
	import { mode } from 'mode-watcher';
	import { PUBLIC_DISCORD_CLIENT_ID, PUBLIC_GOOGLE_CLIENT_ID } from '$env/static/public';

	let loadingDiscord = $state(false);
	let loadingGoogle = $state(false);

	function handleDiscordLogin() {
		loadingDiscord = true;
		const callbackUrl = new URL(window.location.href);
		callbackUrl.search = '';
		callbackUrl.hash = '';
		callbackUrl.pathname = '/api/callback';
		window.location.href =
			`https://discord.com/oauth2/authorize` +
			`?client_id=${PUBLIC_DISCORD_CLIENT_ID}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(callbackUrl.toString())}` +
			`&scope=identify+email`;
	}

	function handleGoogleLogin() {
		loadingGoogle = true;
		const callbackUrl = new URL(window.location.href);
		callbackUrl.search = '';
		callbackUrl.hash = '';
		callbackUrl.pathname = '/api/google-callback';
		window.location.href =
			`https://accounts.google.com/o/oauth2/v2/auth` +
			`?client_id=${PUBLIC_GOOGLE_CLIENT_ID}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(callbackUrl.toString())}` +
			`&scope=openid+email+profile` +
			`&access_type=online`;
	}
</script>

<svelte:head>
	<title>Lyntr — The social media with an IQ test</title>
	<meta
		name="description"
		content="Lyntr is a social network with Lynts, polls, forums, profile songs, badges, DMs, hashtags and an IQ test. Have fun!"
	/>
</svelte:head>

<div class="landing">
	<main>
		<img
			class="logo"
			src={mode.current === 'dark' ? 'logo_dark.svg' : 'logo_light.svg'}
			alt="Lyntr"
		/>

		<h1 class="wordmark">Lyntr.</h1>

		<p class="tagline">The social media with an IQ test.</p>

		<div class="actions">
			<button class="oauth discord" onclick={handleDiscordLogin} disabled={loadingDiscord || loadingGoogle}>
				<svg viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
					<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
				</svg>
				{loadingDiscord ? 'Redirecting...' : 'Use Discord like a CHAD'}
			</button>

			<button class="oauth google" onclick={handleGoogleLogin} disabled={loadingDiscord || loadingGoogle}>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
					<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
					<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
					<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
				</svg>
				{loadingGoogle ? 'Redirecting...' : 'Continue with Google'}
			</button>
		</div>

		<div class="credit-card">
			<p>A project by <span class="credit-name">GizmoWizard</span>.</p>
		</div>

		<nav class="foot-links">
			<a href="/about">About</a>
			<span class="sep" aria-hidden="true">·</span>
			<a href="/tos">Terms Of Service</a>
			<span class="sep" aria-hidden="true">·</span>
			<a href="/privacy">Privacy Policy</a>
		</nav>
	</main>
</div>

<style>
	.landing {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 380px;
		width: 100%;
	}

	.logo {
		width: 88px;
		height: 88px;
		object-fit: contain;
		margin-bottom: 18px;
	}

	.wordmark {
		font-family: var(--font-retro);
		font-weight: 700;
		font-size: 34px;
		line-height: 1;
		color: hsl(var(--foreground));
		margin: 0 0 10px;
	}

	.tagline {
		font-family: var(--font-retro);
		font-size: 14px;
		color: hsl(var(--muted-foreground));
		margin: 0 0 28px;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
	}

	.oauth {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 13px 16px;
		border-radius: 999px;
		font-family: var(--font-retro);
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		color: hsl(var(--foreground));
		background: hsl(var(--foreground) / 0.06);
		border: 1px solid hsl(var(--foreground) / 0.1);
		transition: background 0.12s ease;
	}

	.oauth svg {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.oauth:hover:not(:disabled) {
		background: hsl(var(--foreground) / 0.1);
	}

	.oauth:active:not(:disabled) {
		background: hsl(var(--foreground) / 0.14);
	}

	.oauth:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.credit-card {
		margin-top: 26px;
		width: 100%;
		border-radius: 6px;
		padding: 12px 16px;
		background: hsl(var(--card));
		border-top: 1px solid var(--bevel-light);
		border-left: 1px solid var(--bevel-light);
		border-bottom: 1px solid var(--bevel-dark);
		border-right: 1px solid var(--bevel-dark);
		box-shadow: var(--hard-shadow-sm);
	}

	.credit-card p {
		margin: 0;
		font-family: var(--font-retro);
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}

	.credit-name {
		color: hsl(var(--foreground));
		font-weight: 700;
	}

	.foot-links {
		margin-top: 18px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-retro);
		font-size: 12px;
	}

	.foot-links a {
		color: hsl(var(--muted-foreground));
		text-decoration: none;
	}

	.foot-links a:hover {
		color: hsl(var(--foreground));
		text-decoration: underline;
	}

	.foot-links .sep {
		color: hsl(var(--border));
	}
</style>