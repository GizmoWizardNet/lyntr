import { redirect, type RequestHandler } from '@sveltejs/kit';

import {
	createDesktopAuthTransaction
} from '@/server/desktopAuth';

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

export const GET: RequestHandler = async ({ url }) => {
	const state = url.searchParams.get('state');

	if (!state || state.length < 16 || state.length > 512) {
		return new Response('Invalid desktop authentication state.', {
			status: 400
		});
	}

	const transactionId = await createDesktopAuthTransaction(state);

	const oauthState = `${transactionId}.${state}`;

	const discordParams = new URLSearchParams({
		client_id: process.env.PUBLIC_DISCORD_CLIENT_ID!,
		redirect_uri: `${url.origin}/api/callback`,
		response_type: 'code',
		scope: 'identify email',
		state: oauthState
	});

	const googleParams = new URLSearchParams({
		client_id: process.env.PUBLIC_GOOGLE_CLIENT_ID!,
		redirect_uri: `${url.origin}/api/google-callback`,
		response_type: 'code',
		scope: 'openid email profile',
		access_type: 'online',
		state: oauthState
	});

	const discordUrl =
		`https://discord.com/oauth2/authorize?${discordParams.toString()}`;

	const googleUrl =
		`https://accounts.google.com/o/oauth2/v2/auth?${googleParams.toString()}`;

	const html = `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Sign in to Lyntr</title>

	<style>
		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			background: #0d0d0f;
			color: #fff;
			font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		}

		.card {
			width: min(420px, calc(100vw - 32px));
			padding: 32px;
			border: 1px solid #29292e;
			border-radius: 18px;
			background: #151519;
			box-shadow: 0 20px 80px rgba(0, 0, 0, .45);
		}

		.logo {
			font-size: 32px;
			font-weight: 800;
			letter-spacing: -1px;
			margin-bottom: 8px;
		}

		.subtitle {
			color: #a1a1aa;
			margin-bottom: 28px;
		}

		a {
			display: block;
			padding: 13px 16px;
			margin-top: 12px;
			border-radius: 10px;
			text-align: center;
			text-decoration: none;
			font-weight: 700;
			color: white;
			background: #29292f;
			transition: background .15s ease;
		}

		a:hover {
			background: #38383f;
		}
	</style>
</head>

<body>
	<main class="card">
		<div class="logo">Lyntr</div>
		<div class="subtitle">
			Sign in to Lyntr Desktop
		</div>

		<a href="${escapeHtml(discordUrl)}">
			Continue with Discord
		</a>

		<a href="${escapeHtml(googleUrl)}">
			Continue with Google
		</a>
	</main>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};