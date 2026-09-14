import { json, type RequestHandler } from '@sveltejs/kit';

import { db } from '@/server/db';
import { users } from '@/server/schema';

import {
	consumeDesktopAuthCode,
	createDesktopAuthToken
} from '@/server/desktopAuth';

import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (
			!body ||
			typeof body.code !== 'string' ||
			body.code.length < 20 ||
			body.code.length > 256
		) {
			return json(
				{ message: 'Invalid authentication code.' },
				{ status: 400 }
			);
		}

		const userId = await consumeDesktopAuthCode(body.code);

		if (!userId) {
			return json(
				{
					message:
						'Authentication code is invalid, expired, or already used.'
				},
				{ status: 401 }
			);
		}

		const user = await db
			.select({
				id: users.id,
				banned: users.banned
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user[0]) {
			return json(
				{ message: 'User no longer exists. Or never did.' },
				{ status: 401 }
			);
		}

		if (user[0].banned) {
			return json(
				{ message: 'You are banned. Karma has acted upon you.' },
				{ status: 403 }
			);
		}

		const token = await createDesktopAuthToken(userId);

		return json({
			token,
			token_type: 'Bearer',
			expires_in: 60 * 60 * 24 * 30
		});
	} catch (error) {
		console.error(
			'[Desktop Auth] Exchange failed:',
			error
		);

		return json(
			{ message: 'Unexpected authentication error.' },
			{ status: 500 }
		);
	}
};