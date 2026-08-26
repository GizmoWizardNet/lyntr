import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { authenticateApiRequest, isApiAuthResponse } from '@/server/apiAuth';
import { db } from '@/server/db';
import { users } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { isValidNameColor } from '@/nameColors';

export const GET: RequestHandler = async ({ request }) => {
	const auth = await authenticateApiRequest(request);
	if (isApiAuthResponse(auth)) return auth;

	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			handle: users.handle,
			bio: users.bio,
			iq: users.iq,
			created_at: users.created_at,
			is_admin: users.is_admin,
			verified: users.verified,
			lynt_coins: users.lynt_coins
		})
		.from(users)
		.where(eq(users.id, auth.userId))
		.limit(1);

	if (!user) return json({ error: 'User not found' }, { status: 404 });

	return json(user);
};

// PATCH /api/v1/me — text-only profile customization (bio, display name,
// name color). Matches the app's own validation rules. Avatar/banner/
// profile-song uploads aren't available over the API yet — those require
// multipart file handling that the v1 API doesn't do for any endpoint
// right now (posts are text-only too, for the same reason).
export const PATCH: RequestHandler = async ({ request }) => {
	const auth = await authenticateApiRequest(request, { sensitive: true });
	if (isApiAuthResponse(auth)) return auth;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const [currentUser] = await db
		.select({ verified: users.verified })
		.from(users)
		.where(eq(users.id, auth.userId))
		.limit(1);
	if (!currentUser) return json({ error: 'User not found' }, { status: 404 });

	const updateData: Partial<typeof users.$inferInsert> = {};

	if ('bio' in body) {
		if (body.bio !== null && typeof body.bio !== 'string') {
			return json({ error: 'bio must be a string or null' }, { status: 400 });
		}
		if (typeof body.bio === 'string' && body.bio.length > 256) {
			return json({ error: 'Bio must be 256 characters or less' }, { status: 400 });
		}
		updateData.bio = body.bio ?? '';
	}

	if ('username' in body) {
		if (typeof body.username !== 'string' || !body.username.trim()) {
			return json({ error: 'username must be a non-empty string' }, { status: 400 });
		}
		if (body.username.length > 60) {
			return json({ error: 'Username must be 60 characters or less' }, { status: 400 });
		}
		updateData.username = body.username;
	}

	if ('name_color' in body) {
		const nameColor = body.name_color === '' || body.name_color === null ? null : body.name_color;
		if (nameColor !== null && !currentUser.verified) {
			return json({ error: 'Get verified to unlock name colors' }, { status: 403 });
		}
		if (!isValidNameColor(nameColor)) {
			return json({ error: 'Invalid name color' }, { status: 400 });
		}
		updateData.name_color = nameColor;
	}

	if (Object.keys(updateData).length === 0) {
		return json({ error: 'No valid fields to update. Supported: bio, username, name_color.' }, { status: 400 });
	}

	const [updated] = await db
		.update(users)
		.set(updateData)
		.where(eq(users.id, auth.userId))
		.returning({
			id: users.id,
			username: users.username,
			handle: users.handle,
			bio: users.bio,
			name_color: users.name_color,
			verified: users.verified
		});

	return json(updated);
};
