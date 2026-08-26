import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { createAuthJWT } from '@/server/jwt';

export const GET: RequestHandler = async ({ url, cookies }) => {
	try {
		const code = url.searchParams.get('code');
		if (!code) return json({ error: 'No code parameter' }, { status: 400 });

		// Build redirect URI — must exactly match what's registered in Google Cloud Console
		const redirectUri = new URL(url);
		redirectUri.search = '';
		redirectUri.pathname = '/api/google-callback';
		if (redirectUri.port === '') redirectUri.protocol = 'https:';
		const redirectUriStr = redirectUri.toString();

		// Exchange code for tokens
		const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id:     process.env.PUBLIC_GOOGLE_CLIENT_ID!,
				client_secret: process.env.GOOGLE_CLIENT_SECRET!,
				redirect_uri:  redirectUriStr,
				grant_type:    'authorization_code'
			})
		});

		if (!tokenRes.ok) {
			console.error('Google token exchange failed:', await tokenRes.text());
			return json({ error: 'Google token exchange failed' }, { status: 400 });
		}

		const tokenData = await tokenRes.json() as { access_token: string };
		const accessToken = tokenData.access_token;

		// Get user info from Google
		const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: { Authorization: `Bearer ${accessToken}` }
		});

		if (!userRes.ok) return json({ error: 'Failed to fetch Google user' }, { status: 400 });

		const googleUser = await userRes.json() as {
			email: string;
			name: string;
			picture: string;
			id: string;
		};

		if (!googleUser.email) return json({ error: 'No email from Google' }, { status: 400 });

		// Check if user already has an account
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.email, googleUser.email))
			.limit(1);

		if (existingUser.length > 0) {
			// Returning user — log them in directly
			const jwt = await createAuthJWT({
				userId: existingUser[0].id,
				timestamp: Date.now()
			});
			cookies.set('_TOKEN__DO_NOT_SHARE', jwt, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 31536000
			});
		}

		// Store Google access token as a temp cookie so the AccountCreator
		// can use it during registration (same pattern as Discord)
		cookies.set('temp-google-token', accessToken, {
			path: '/',
			httpOnly: false,
			secure: false,
			sameSite: 'lax',
			maxAge: 600 // 10 minutes — just enough to complete registration
		});

		// Store Google user info so profile/+server.ts can read it
		// (Google userinfo isn't re-fetchable without re-auth, so we cache it)
		cookies.set('temp-google-user', JSON.stringify({
			email:   googleUser.email,
			name:    googleUser.name,
			picture: googleUser.picture,
			id:      googleUser.id
		}), {
			path: '/',
			httpOnly: false,
			secure: false,
			maxAge: 600
		});

		return new Response(null, {
			status: 301,
			headers: { Location: '/' }
		});
	} catch (error) {
		console.error('Google callback error:', error);
		return json({ error: 'Unexpected error during Google auth' }, { status: 500 });
	}
};
