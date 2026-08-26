import type { PageServerLoad } from './$types';
import { getScrollable } from '$lib/server/scrollables';

// Deliberately no auth/viewer-state here — this page is rendered inside
// another platform's iframe (Twitter/X's player card), never by a logged
// in visitor directly, so there's no "viewer" to personalize for.
export const load: PageServerLoad = async ({ params }) => {
	const scrollable = await getScrollable(params.id!, null);
	return { scrollable };
};
