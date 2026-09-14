config({ path: '.env' });
import { db } from '@/server/db';
import { createAuthJWT } from '@/server/jwt';
import { users } from '@/server/schema';

import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

//Desktop Auth
import {
	completeDesktopAuthTransaction,
	getDesktopTransaction
} from '@/server/desktopAuth';

export const GET: RequestHandler = async ({ request, url, cookies }) => {
	try {
		console.log("URL:", url.toString());
		console.log("Protocol:", url.protocol);
		console.log("Port:", url.port);
		const code = url.searchParams.get('code');
		const oauthState = url.searchParams.get('state');

		let desktopTransactionId: string | null = null;
		let desktopState: string | null = null;

		if (oauthState) {
			const separator = oauthState.indexOf('.');

			if (separator > 0) {
				desktopTransactionId = oauthState.slice(0, separator);
				desktopState = oauthState.slice(separator + 1);
			}
		}
		if (!code) return json({ error: 'No code search parameter' }, { status: 400 });

		const formData = new URLSearchParams();
		formData.set('grant_type', 'authorization_code');
		formData.set('code', code);
		url.search = '';
		if (url.port == '') url.protocol = 'https://';
		formData.set('redirect_uri', url.toString());

		const codeRes = await fetch('https://discord.com/api/v10/oauth2/token', {
			method: 'POST',
			body: formData,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization:
					'Basic ' +
					btoa(`${process.env.PUBLIC_DISCORD_CLIENT_ID}:${process.env.DISCORD_CLIENT_SECRET}`)
			}
		});

		console.log("Discord status:", codeRes.status);
		console.log("Discord status text:", codeRes.statusText);

		if (codeRes.status != 200) return json({ errror: 'Invalid state' }, { status: 400 });
		const data = await codeRes.json();

		const accessToken = data['access_token'];
		const meRes = await fetch('https://discord.com/api/v10/users/@me', {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (meRes.status != 200) return json({ errror: 'Invalid user' }, { status: 400 });
		const meBody = await meRes.json();

		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.email, meBody.email))
			.limit(1);

		if (existingUser.length > 0) {
			const user = existingUser[0];

			if (desktopTransactionId && desktopState) {
				const transaction = await getDesktopTransaction(
					desktopTransactionId,
					desktopState
				);

				if (!transaction) {
					return json(
						{ error: 'Invalid or expired desktop authentication transaction' },
						{ status: 400 }
					);
				}

				const desktopCode = await completeDesktopAuthTransaction(
					transaction.id,
					user.id
				);

				return new Response(null, {
					status: 302,
					headers: {
						Location:
							`lyntr://auth/callback?code=${encodeURIComponent(desktopCode)}&state=${encodeURIComponent(desktopState)}`
					}
				});
			}

			const jwt = await createAuthJWT({
				userId: user.id,
				timestamp: Date.now()
			});

			cookies.set('_TOKEN__DO_NOT_SHARE', jwt, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'strict',
				maxAge: 31536000
			});
		}

		if (desktopTransactionId) {
			return json(
				{
					error: 'No Lyntr account exists for this Discord account.'
				},
				{ status: 404 }
			);
		}
		
		cookies.set('temp-discord-token', accessToken, {
			path: '/',
			httpOnly: false,
			secure: false
		});

		return new Response(null, {
			status: 301,
			headers: {
				Location: '/'
			}
		});
	} catch (error) {
		console.error('Error while handling discord callback', error);
		return json({ error: 'Unexpected internal error' }, { status: 500 });
	}
};
