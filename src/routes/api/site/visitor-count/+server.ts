import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// ════════════════════════════════════════════════
// VISITOR COUNTER — classic GeoCities/forum hit counter energy.
// Deliberately in-memory: it resets when the server restarts, just like
// the real ones did when your shared host hiccuped. Don't "fix" this —
// it's part of the bit. If you want it to survive restarts, back it with
// a row in your DB instead.
// ════════════════════════════════════════════════

let count = 5; // start it mid-flight, like you found this site already a little popular

export const GET: RequestHandler = async ({ cookies }) => {
	// Only count once per browser session, the way "unique visitors" counters
	// pretended to work back then.
	if (!cookies.get('lyntr_counted')) {
		count++;
		cookies.set('lyntr_counted', '1', { path: '/', maxAge: 60 * 60 * 24 });
	}
	return json({ count });
};
