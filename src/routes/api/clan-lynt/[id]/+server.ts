import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '@/server/requireUser';
import { db } from '@/server/db';
import { clanLynts, clanLyntMembers, users } from '@/server/schema';
import { eq } from 'drizzle-orm';

// GET /api/clan-lynt/[id] — draft + full member chain, for rendering the
// accept/decline/edit screen. Only members of the chain can view it.
export const GET: RequestHandler = async ({ params, cookies }) => {
	const userId = await requireUser(cookies);
	if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

	const [clan] = await db.select().from(clanLynts).where(eq(clanLynts.id, params.id!)).limit(1);
	if (!clan) return json({ error: 'Not found' }, { status: 404 });

	const members = await db
		.select({
			userId: clanLyntMembers.user_id,
			position: clanLyntMembers.position,
			status: clanLyntMembers.status,
			username: users.username,
			handle: users.handle
		})
		.from(clanLyntMembers)
		.innerJoin(users, eq(users.id, clanLyntMembers.user_id))
		.where(eq(clanLyntMembers.clan_id, clan.id))
		.orderBy(clanLyntMembers.position);

	const me = members.find((m) => m.userId === userId);
	if (!me) return json({ error: 'Not a member of this clan lynt' }, { status: 403 });

	return json({
		id: clan.id,
		content: clan.content,
		gifUrl: clan.gif_url,
		gifPreviewUrl: clan.gif_preview_url,
		status: clan.status,
		currentStep: clan.current_step,
		myPosition: me.position,
		myTurn: me.position === clan.current_step && clan.status === 'pending',
		members
	});
};
