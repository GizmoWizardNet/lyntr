import type { RequestHandler } from '@sveltejs/kit';

// This endpoint is retired. Real-time updates moved from Server-Sent Events
// to a WebSocket connection at /ws (handled directly in server.ts, outside
// of SvelteKit's routing — see attachWebSocketServer in src/lib/ws.ts).
//
// Kept as a 410 Gone (rather than deleting the route outright) so that any
// stale client tabs that still have the old EventSource code cached get a
// clear, fast-failing signal instead of an indefinitely hanging connection.
export const GET: RequestHandler = async () => {
	return new Response(
		'This endpoint has moved. Real-time updates are now served over WebSocket at.',
		{ status: 410 }
	);
};
