import { json } from '@sveltejs/kit';
import { authenticateClientCredentials } from './apiClients';
import { normalRatelimit, sensitiveRatelimit } from './ratelimit';

export type ApiAuthResult = { userId: string; clientRowId: string };

/**
 * Resolves a Developer API request to a userId, or returns a Response to
 * send straight back (401/429) if auth/rate-limiting fails.
 *
 * Credentials can be sent either as:
 *   Authorization: Basic base64(client_id:client_secret)
 * or:
 *   X-Client-Id: ...
 *   X-Client-Secret: ...
 */
export async function authenticateApiRequest(
	request: Request,
	opts: { sensitive?: boolean } = {}
): Promise<ApiAuthResult | Response> {
	let clientId: string | null = null;
	let clientSecret: string | null = null;

	const authHeader = request.headers.get('authorization');
	if (authHeader?.startsWith('Basic ')) {
		try {
			const decoded = atob(authHeader.slice('Basic '.length));
			const idx = decoded.indexOf(':');
			if (idx !== -1) {
				clientId = decoded.slice(0, idx);
				clientSecret = decoded.slice(idx + 1);
			}
		} catch {
			// fall through to header-based auth below
		}
	}

	if (!clientId || !clientSecret) {
		clientId = request.headers.get('x-client-id');
		clientSecret = request.headers.get('x-client-secret');
	}

	if (!clientId || !clientSecret) {
		return json(
			{
				error:
					'Missing API credentials. Send "Authorization: Basic base64(client_id:client_secret)" or the "X-Client-Id" / "X-Client-Secret" headers.'
			},
			{ status: 401 }
		);
	}

	const auth = await authenticateClientCredentials(clientId, clientSecret);
	if (!auth) {
		return json({ error: 'Invalid or revoked API credentials.' }, { status: 401 });
	}

	const limiter = opts.sensitive ? sensitiveRatelimit : normalRatelimit;
	const { success } = await limiter.limit(`apiclient:${auth.clientRowId}`);
	if (!success) {
		return json({ error: 'Rate limit exceeded.' }, { status: 429 });
	}

	return auth;
}

export function isApiAuthResponse(x: ApiAuthResult | Response): x is Response {
	return x instanceof Response;
}
