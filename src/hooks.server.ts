// src/hooks.server.ts
// add support for the cross-origin official tauri desktop app

import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { verifyDesktopAuthToken } from '@/server/desktopAuth';

const DEFAULT_APP_ORIGINS = [
	'http://tauri.localhost',
	'https://tauri.localhost',
	'tauri://localhost',
	'http://localhost:1420'
];

const allowedOrigins = new Set(
	(env.ALLOWED_APP_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []).concat(
		DEFAULT_APP_ORIGINS
	)
);

function applyCors(headers: Headers, origin: string | null) {
	if (!origin || !allowedOrigins.has(origin)) return;
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Access-Control-Allow-Credentials', 'true');
	headers.set('Vary', 'Origin');
}

async function hydrateDesktopSession(event: Parameters<Handle>[0]['event']) {
	if (event.cookies.get('_TOKEN__DO_NOT_SHARE')) return;

	const authorization = event.request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return;

	const desktopToken = authorization.slice('Bearer '.length).trim();
	if (!desktopToken) return;

	const payload = await verifyDesktopAuthToken(desktopToken);
	if (!payload?.userId) return;

	event.cookies.set('_TOKEN__DO_NOT_SHARE', desktopToken, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: 60
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	const origin = event.request.headers.get('origin');
	const isApiRoute = event.url.pathname.startsWith('/api/');

	if (isApiRoute) {
		await hydrateDesktopSession(event);
	}
	if (isApiRoute && event.request.method === 'OPTIONS') {
		const headers = new Headers();
		applyCors(headers, origin);
		headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
		headers.set(
			'Access-Control-Allow-Headers',
			event.request.headers.get('access-control-request-headers') ?? 'Content-Type'
		);
		headers.set('Access-Control-Max-Age', '86400');
		return new Response(null, { status: 204, headers });
	}

	const response = await resolve(event);

	if (isApiRoute) {
		applyCors(response.headers, origin);
	}

	return response;
};