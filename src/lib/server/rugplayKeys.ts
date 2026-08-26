import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';
import { decryptApiKey } from './rugplayCrypto';

/** Cheap live check that a Rugplay key actually authenticates. */
export async function validateRugplayKey(apiKey: string): Promise<boolean> {
	if (!/^rgpl_/.test(apiKey)) return false;
	try {
		const res = await fetch('https://rugplay.com/api/v1/top', {
			headers: { Authorization: `Bearer ${apiKey}` }
		});
		return res.ok;
	} catch {
		return false;
	}
}

export type RugplayKeyLookup =
	| { status: 'not_enabled' }
	| { status: 'no_valid_key' }
	| { status: 'ok'; apiKey: string };

/**
 * Server-only. Resolves the API key to use for a given Lynt author's
 * $SYMBOL embeds: their own key if Rugplay Enhancements is on and the
 * stored key currently validates, otherwise a reason why not.
 *
 * The decrypted key returned here must stay server-side — only ever used
 * to make the outbound fetch() to rugplay.com, never echoed back to any
 * client response.
 */
export async function resolveRugplayKeyForHandle(handle: string): Promise<RugplayKeyLookup> {
	const [user] = await db
		.select({
			enabled: users.rugplay_enhancements_enabled,
			keyEnc: users.rugplay_api_key_enc,
			keyValid: users.rugplay_key_valid
		})
		.from(users)
		.where(eq(users.handle, handle))
		.limit(1);

	if (!user || !user.enabled) return { status: 'not_enabled' };
	if (!user.keyEnc || !user.keyValid) return { status: 'no_valid_key' };

	try {
		return { status: 'ok', apiKey: decryptApiKey(user.keyEnc) };
	} catch (err) {
		console.error('Failed to decrypt stored Rugplay key:', err);
		return { status: 'no_valid_key' };
	}
}
