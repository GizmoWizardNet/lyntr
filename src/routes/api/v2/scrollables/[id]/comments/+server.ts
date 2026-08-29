import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { listScrollableComments } from '@/server/scrollables';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';


export const GET: RequestHandler = async ({ request, params }) => {
    const auth = await authenticateApiRequest(request);
    if (isApiAuthResponse(auth)) return auth;

	const comments = await listScrollableComments(params.id!);
	return json({ comments });
};
