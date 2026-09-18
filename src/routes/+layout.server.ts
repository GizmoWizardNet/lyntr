import type { LayoutServerLoad } from './$types';
import { getCurrentUser } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ request, cookies }) => {
	// getCurrentUser() itself checks both the desktop bearer token and the
	// web session cookie, and returns null immediately (no DB hit) when
	// neither is present — safe to call unconditionally here.
	const user = await getCurrentUser(request, cookies);

	return { user };
};
