import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { listScrollableComments } from '@/server/scrollables';

export const GET: RequestHandler = async ({ params }) => {
	const comments = await listScrollableComments(params.id!);
	return json({ comments });
};
