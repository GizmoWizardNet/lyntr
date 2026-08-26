/**
 * server.ts  –  Lyntr custom Node.js entry point
 *
 * Boots the SvelteKit adapter-node handler and attaches a ws.WebSocketServer
 * on the same HTTP server so WebSocket upgrades share the same port as HTTP.
 *
 * Run with:  bun server.ts  (or  npx tsx server.ts  during development)
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handler } from './build/handler.js';   // SvelteKit adapter-node output
import { attachWebSocketServer } from './src/lib/ws.ts';
import { verifyAuthJWT } from './src/lib/server/jwt.ts';
import 'dotenv/config';

const PORT = Number(process.env.PORT ?? 3000);

// ── HTTP server wrapping the SvelteKit handler ───────────────────────────────
const httpServer = createServer(handler);

// ── WebSocket server (no separate port – upgrades handled inline) ─────────────
const wss = new WebSocketServer({ noServer: true });

// Hand upgrade events to ws ourselves so SvelteKit never sees them.
httpServer.on('upgrade', (req, socket, head) => {
	if (req.url === '/ws') {
		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit('connection', ws, req);
		});
	} else {
		socket.destroy();
	}
});

// Wire up application-level WS logic.
attachWebSocketServer(wss, verifyAuthJWT);

httpServer.listen(PORT, () => {
	console.log(`Lyntr listening on http://localhost:${PORT}`);
});
