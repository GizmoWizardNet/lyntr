import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { db } from './db';
import { apiClients, users } from './schema';
import { and, eq } from 'drizzle-orm';

// ── Secret hashing (scrypt, no extra dependency needed) ───────────────────

function hashSecret(secret: string, salt: string): string {
	return scryptSync(secret, salt, 64).toString('hex');
}

function verifySecret(secret: string, salt: string, hash: string): boolean {
	const candidate = hashSecret(secret, salt);
	const a = Buffer.from(candidate, 'hex');
	const b = Buffer.from(hash, 'hex');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function generateClientId(): string {
	return `lyntr_${randomBytes(16).toString('hex')}`;
}

function generateClientSecret(): string {
	return `lsk_${randomBytes(32).toString('base64url')}`;
}

// ── CRUD ────────────────────────────────────────────────────────────────

export type ApiClientSummary = {
	id: string;
	name: string;
	client_id: string;
	secret_last4: string;
	revoked: boolean;
	created_at: Date | null;
	last_used_at: Date | null;
	secret_version: number;
};

export async function listApiClients(userId: string): Promise<ApiClientSummary[]> {
	return db
		.select({
			id: apiClients.id,
			name: apiClients.name,
			client_id: apiClients.client_id,
			secret_last4: apiClients.secret_last4,
			revoked: apiClients.revoked,
			created_at: apiClients.created_at,
			last_used_at: apiClients.last_used_at,
			secret_version: apiClients.secret_version
		})
		.from(apiClients)
		.where(eq(apiClients.user_id, userId))
		.orderBy(apiClients.created_at);
}

const MAX_CLIENTS_PER_USER = 10;

export async function createApiClient(userId: string, name: string) {
	const existing = await db
		.select({ id: apiClients.id })
		.from(apiClients)
		.where(eq(apiClients.user_id, userId));

	if (existing.length >= MAX_CLIENTS_PER_USER) {
		throw new Error(`You can have at most ${MAX_CLIENTS_PER_USER} API credentials.`);
	}

	const clientId = generateClientId();
	const secret = generateClientSecret();
	const salt = randomBytes(16).toString('hex');
	const hash = hashSecret(secret, salt);

	const [row] = await db
		.insert(apiClients)
		.values({
			user_id: userId,
			name: name?.trim() || 'Default',
			client_id: clientId,
			secret_hash: hash,
			secret_salt: salt,
			secret_last4: secret.slice(-4)
		})
		.returning({ id: apiClients.id, created_at: apiClients.created_at });

	// Plaintext secret is returned exactly once and never persisted.
	return {
		id: row.id,
		name: name?.trim() || 'Default',
		client_id: clientId,
		client_secret: secret,
		created_at: row.created_at
	};
}

export async function regenerateApiClientSecret(userId: string, clientRowId: string) {
	const [existing] = await db
		.select()
		.from(apiClients)
		.where(and(eq(apiClients.id, clientRowId), eq(apiClients.user_id, userId)))
		.limit(1);

	if (!existing) throw new Error('Credential not found.');
	if (existing.revoked) throw new Error('This credential has been revoked. Create a new one instead.');

	const secret = generateClientSecret();
	const salt = randomBytes(16).toString('hex');
	const hash = hashSecret(secret, salt);

	await db
		.update(apiClients)
		.set({
			secret_hash: hash,
			secret_salt: salt,
			secret_last4: secret.slice(-4),
			secret_version: existing.secret_version + 1
		})
		.where(eq(apiClients.id, clientRowId));

	return {
		id: existing.id,
		client_id: existing.client_id,
		client_secret: secret
	};
}

export async function revokeApiClient(userId: string, clientRowId: string) {
	const result = await db
		.update(apiClients)
		.set({ revoked: true })
		.where(and(eq(apiClients.id, clientRowId), eq(apiClients.user_id, userId)))
		.returning({ id: apiClients.id });

	if (result.length === 0) throw new Error('Credential not found.');
}

export async function deleteApiClient(userId: string, clientRowId: string) {
	const result = await db
		.delete(apiClients)
		.where(and(eq(apiClients.id, clientRowId), eq(apiClients.user_id, userId)))
		.returning({ id: apiClients.id });

	if (result.length === 0) throw new Error('Credential not found.');
}

// ── Auth: resolve a (client_id, client_secret) pair to a user ─────────────

export async function authenticateClientCredentials(
	clientId: string,
	clientSecret: string
): Promise<{ userId: string; clientRowId: string } | null> {
	if (!clientId || !clientSecret) return null;

	const [row] = await db
		.select()
		.from(apiClients)
		.where(eq(apiClients.client_id, clientId))
		.limit(1);

	if (!row || row.revoked) return null;
	if (!verifySecret(clientSecret, row.secret_salt, row.secret_hash)) return null;

	const [user] = await db.select({ id: users.id, banned: users.banned }).from(users).where(eq(users.id, row.user_id)).limit(1);
	if (!user || user.banned) return null;

	// Fire-and-forget last-used timestamp update — not on the critical path.
	db.update(apiClients).set({ last_used_at: new Date() }).where(eq(apiClients.id, row.id)).catch(() => {});

	return { userId: user.id, clientRowId: row.id };
}
