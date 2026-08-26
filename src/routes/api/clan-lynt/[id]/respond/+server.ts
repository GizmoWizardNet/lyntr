import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { respondToClanStep, ClanLyntError } from '@/server/clanLynt';
import { moderateContent } from '@/moderation';

// POST /api/clan-lynt/[id]/respond
// body: { action: 'accept' | 'decline', content?: string }
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body || (body.action !== 'accept' && body.action !== 'decline')) {
		return json({ error: 'action must be "accept" or "decline"' }, { status: 400 });
	}

	let editedContent: string | undefined;
	if (body.action === 'accept' && typeof body.content === 'string' && body.content.trim()) {
		editedContent = body.content.trim();
		if (editedContent.length > 280) return json({ error: 'Content is too long' }, { status: 400 });
		const verdict = await moderateContent(editedContent);
		if (!verdict.allowed) return json({ error: verdict.reason }, { status: 400 });
	}

	try {
		const result = await respondToClanStep(params.id!, userId, body.action, editedContent);
		return json(result);
	} catch (e) {
		if (e instanceof ClanLyntError) return json({ error: e.message }, { status: e.status });
		console.error('Clan lynt respond error:', e);
		return json({ error: 'Failed to respond to clan lynt' }, { status: 500 });
	}
};
