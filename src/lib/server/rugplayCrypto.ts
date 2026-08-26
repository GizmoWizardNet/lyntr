import crypto from 'crypto';

/**
 * Encrypts/decrypts user-supplied Rugplay API keys for storage.
 *
 * IMPORTANT: this is encryption-at-rest against DB compromise, not a
 * substitute for keeping the key server-side-only. The decrypted key
 * must NEVER be sent to any client — it's only ever read inside server
 * code to make a fetch() to rugplay.com on the key owner's behalf.
 *
 * Set RUGPLAY_KEY_ENC_SECRET in your .env to a long random string in
 * production. Falls back to JWT_SECRET (with a console warning) so this
 * doesn't hard-break existing deployments that haven't added the new var
 * yet — but you should set a dedicated secret.
 */

function getKey(): Buffer {
	const secret = process.env.RUGPLAY_KEY_ENC_SECRET ?? process.env.JWT_SECRET;
	if (!secret) {
		throw new Error(
			'Cannot encrypt Rugplay API keys: set RUGPLAY_KEY_ENC_SECRET (or JWT_SECRET) in your .env'
		);
	}
	if (!process.env.RUGPLAY_KEY_ENC_SECRET) {
		console.warn(
			'[rugplayCrypto] RUGPLAY_KEY_ENC_SECRET not set — reusing JWT_SECRET to encrypt Rugplay API keys. ' +
				'Set a dedicated RUGPLAY_KEY_ENC_SECRET in production.'
		);
	}
	// Derive a fixed-length 256-bit key from whatever secret string was provided.
	return crypto.createHash('sha256').update(secret).digest();
}

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recommended for GCM

export function encryptApiKey(plaintext: string): string {
	const key = getKey();
	const iv = crypto.randomBytes(IV_LEN);
	const cipher = crypto.createCipheriv(ALGO, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	// Pack iv + tag + ciphertext together, base64-encoded, so it's a single TEXT column.
	return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptApiKey(packed: string): string {
	const key = getKey();
	const buf = Buffer.from(packed, 'base64');
	const iv = buf.subarray(0, IV_LEN);
	const tag = buf.subarray(IV_LEN, IV_LEN + 16);
	const ciphertext = buf.subarray(IV_LEN + 16);
	const decipher = crypto.createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return plaintext.toString('utf8');
}
