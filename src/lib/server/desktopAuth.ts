import { createHash, randomBytes } from 'node:crypto';
import * as jose from 'jose';

import { db } from '@/server/db';
import { desktopAuthTransactions } from '@/server/schema';

import { and, eq, gt, isNull, lt } from 'drizzle-orm';

const DESKTOP_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const DESKTOP_CODE_TTL_MS = 2 * 60 * 1000;

const DESKTOP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

function desktopSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }

    return new TextEncoder().encode(secret);
}

export async function createDesktopAuthTransaction(state: string) {
    const now = Date.now();

    const [transaction] = await db
        .insert(desktopAuthTransactions)
        .values({
            state_hash: sha256(state),
            expires_at: new Date(now + DESKTOP_TRANSACTION_TTL_MS)
        })
        .returning({
            id: desktopAuthTransactions.id
        });

    if (!transaction) {
        throw new Error('Failed to create desktop auth transaction');
    }

    return transaction.id;
}

export async function getDesktopTransaction(
    transactionId: string,
    state: string
) {
    const transaction = await db
        .select()
        .from(desktopAuthTransactions)
        .where(
            and(
                eq(desktopAuthTransactions.id, transactionId),
                eq(desktopAuthTransactions.state_hash, sha256(state)),
                gt(desktopAuthTransactions.expires_at, new Date()),
                isNull(desktopAuthTransactions.code_hash),
                isNull(desktopAuthTransactions.consumed_at)
            )
        )
        .limit(1);

    return transaction[0] ?? null;
}

export async function completeDesktopAuthTransaction(
    transactionId: string,
    userId: string
) {
    const code = randomToken(32);
    const codeHash = sha256(code);

    const expiresAt = new Date(Date.now() + DESKTOP_CODE_TTL_MS);

    const updated = await db
        .update(desktopAuthTransactions)
        .set({
            user_id: userId,
            code_hash: codeHash,
            expires_at: expiresAt
        })
        .where(
            and(
                eq(desktopAuthTransactions.id, transactionId),
                isNull(desktopAuthTransactions.code_hash),
                isNull(desktopAuthTransactions.consumed_at)
            )
        )
        .returning({
            id: desktopAuthTransactions.id
        });

    if (updated.length === 0) {
        throw new Error('Desktop authentication transaction already completed');
    }

    return code;
}

export async function consumeDesktopAuthCode(code: string) {
    const now = new Date();

    const consumed = await db
        .update(desktopAuthTransactions)
        .set({
            consumed_at: now
        })
        .where(
            and(
                eq(desktopAuthTransactions.code_hash, sha256(code)),
                gt(desktopAuthTransactions.expires_at, now),
                isNull(desktopAuthTransactions.consumed_at)
            )
        )
        .returning({
            userId: desktopAuthTransactions.user_id
        });

    const userId = consumed[0]?.userId;

    if (!userId) {
        return null;
    }

    return userId;
}

export async function createDesktopAuthToken(userId: string) {
    return await new jose.SignJWT({
        userId,
        type: 'desktop'
    })
        .setProtectedHeader({
            alg: 'HS256'
        })
        .setIssuedAt()
        .setExpirationTime(`${DESKTOP_TOKEN_TTL_SECONDS}s`)
        .sign(desktopSecret());
}

export async function verifyDesktopAuthToken(token: string) {
    try {
        const { payload } = await jose.jwtVerify(token, desktopSecret());

        if (payload.type !== 'desktop') {
            return null;
        }

        if (typeof payload.userId !== 'string') {
            return null;
        }

        return {
            userId: payload.userId
        };
    } catch {
        return null;
    }
}

export async function cleanupDesktopAuthTransactions() {
    await db
        .delete(desktopAuthTransactions)
        .where(
            lt(
                desktopAuthTransactions.expires_at,
                new Date()
            )
        );
}