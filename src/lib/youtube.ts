// Extracts an 11-character YouTube video id from any of the common URL
// shapes people paste in: watch?v=, youtu.be/, shorts/, embed/, or a bare
// id. Returns null if it doesn't look like a valid YouTube video URL/id.

const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseYoutubeId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (ID_RE.test(trimmed)) return trimmed;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}

	const host = url.hostname.replace(/^www\./, '');

	if (host === 'youtu.be') {
		const id = url.pathname.slice(1).split('/')[0];
		return ID_RE.test(id) ? id : null;
	}

	if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
		if (url.pathname === '/watch') {
			const id = url.searchParams.get('v') ?? '';
			return ID_RE.test(id) ? id : null;
		}
		const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
		if (shortsMatch) return shortsMatch[1];
		const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
		if (embedMatch) return embedMatch[1];
	}

	return null;
}
