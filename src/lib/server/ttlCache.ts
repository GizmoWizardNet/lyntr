/**
 * Tiny stale-while-revalidate cache for expensive, viewer-independent queries
 * (e.g. the public feed shown to logged-out visitors).
 *
 * - Fresh value  -> returned immediately.
 * - Stale value  -> returned immediately AND refreshed in the background,
 *                   so visitors never wait on the database after the first hit.
 * - No value yet -> callers share one in-flight request (no stampede).
 * - Refresh fails and we have a stale value -> keep serving it.
 */
export function swrCached<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
	let value: T | undefined;
	let hasValue = false;
	let expiresAt = 0;
	let inflight: Promise<T> | null = null;

	const refresh = (): Promise<T> => {
		if (inflight) return inflight;
		inflight = fn()
			.then((v) => {
				value = v;
				hasValue = true;
				expiresAt = Date.now() + ttlMs;
				return v;
			})
			.finally(() => {
				inflight = null;
			});
		return inflight;
	};

	return async () => {
		if (hasValue && Date.now() < expiresAt) return value as T;
		if (hasValue) {
			refresh().catch((e) => console.error('[swrCached] background refresh failed:', e));
			return value as T;
		}
		return refresh();
	};
}
