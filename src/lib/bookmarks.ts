// Client-side bookmark state. One request fetches the user's bookmarked lynt IDs;
// every Lynt card then does a local Set lookup instead of its own /api/bookmark call.
let idsPromise: Promise<Set<string>> | null = null;

export function loadBookmarkIds(): Promise<Set<string>> {
	if (!idsPromise) {
		idsPromise = fetch('/api/bookmark/ids', { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((d) => new Set<string>((d.ids ?? []).map(String)))
			.catch(() => {
				idsPromise = null; // allow a retry on the next card/mount
				return new Set<string>();
			});
	}
	return idsPromise;
}

export async function setBookmarkedLocal(lyntId: string | number, bookmarked: boolean) {
	const ids = await loadBookmarkIds();
	if (bookmarked) ids.add(String(lyntId));
	else ids.delete(String(lyntId));
}
