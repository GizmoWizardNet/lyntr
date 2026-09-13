//lookup server using lib/profile.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getPublicProfile } from '@/server/profile';
import { verifyAuthJWT } from '@/server/jwt';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	let viewerId: string | null = url.searchParams.get('viewerId');
	if (!viewerId) {
		const token = cookies.get('_TOKEN__DO_NOT_SHARE');
		if (token) {
			try {
				viewerId = (await verifyAuthJWT(token)).userId;
			} catch {
				// dead token obviously
			}
		}
	}
	try {
		const result = await getPublicProfile({ handle: params.handle, viewerId });
		if ('error' in result) return json({ error: result.error }, { status: result.status });
		return json(result.profile);
	} catch (error) {
		console.error('Error fetching user by handle:', error);
		return json({ error: 'Failed to fetch user' }, { status: 500 });
	}
};