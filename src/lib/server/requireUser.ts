import { verifyAuthJWT } from './jwt';

export async function requireUser(cookies: { get: (name: string) => string | undefined }): Promise<string | null> {
	const token = cookies.get('_TOKEN__DO_NOT_SHARE');
	if (!token) return null;
	try {
		const payload = await verifyAuthJWT(token);
		return payload.userId ?? null;
	} catch {
		return null;
	}
}
