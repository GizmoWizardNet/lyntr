/**
 * src/lib/ws-client.ts  –  Browser-side WebSocket client
 *
 * Singleton connection manager with auto-reconnect + exponential backoff,
 * a small pub/sub layer so multiple components can subscribe to the same
 * socket, and convenience methods for the new features (typing indicators,
 * viewer counts, watch/unwatch a lynt panel).
 *
 * Usage (see MainPage.svelte for the full wiring):
 *
 *   import { wsClient } from '$lib/ws-client';
 *
 *   const unsub = wsClient.on('new_lynt', (data) => { ... });
 *   wsClient.connect();
 *   wsClient.watchLynt(lyntId);
 *   wsClient.startTyping(lyntId);
 *   onDestroy(unsub);
 */

type WSHandler = (data: any) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

class WSClient {
	private socket: WebSocket | null = null;
	private handlers = new Map<string, Set<WSHandler>>();
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private intentionalClose = false;
	private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

	get isConnected() {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	connect() {
		if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
			return;
		}
		this.intentionalClose = false;

		const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		this.socket = new WebSocket(`${proto}//${window.location.host}/ws`);

		this.socket.onopen = () => {
			this.reconnectAttempts = 0;
			this.emit('_connected', {});
		};

		this.socket.onmessage = (event) => {
			let data: any;
			try {
				data = JSON.parse(event.data);
			} catch {
				return;
			}
			if (data?.type) this.emit(data.type, data);
		};

		this.socket.onclose = () => {
			this.emit('_disconnected', {});
			if (!this.intentionalClose) this.scheduleReconnect();
		};

		this.socket.onerror = () => {
			// onclose will fire right after; reconnect handled there.
		};
	}

	private scheduleReconnect() {
		if (this.reconnectTimer) return;
		const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
		this.reconnectAttempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	disconnect() {
		this.intentionalClose = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.socket?.close();
		this.socket = null;
	}

	// Public: DMConversation.svelte sends raw dm_typing_start/stop frames
	// directly (they're 1:1 with the wire protocol and don't need their own
	// wrapper method the way watchLynt/startTyping etc. do below).
	send(payload: object) {
		if (this.isConnected) {
			this.socket!.send(JSON.stringify(payload));
		}
	}

	// ── pub/sub ────────────────────────────────────────────────────────────
	on(type: string, handler: WSHandler): () => void {
		if (!this.handlers.has(type)) this.handlers.set(type, new Set());
		this.handlers.get(type)!.add(handler);
		return () => this.handlers.get(type)?.delete(handler);
	}

	private emit(type: string, data: any) {
		this.handlers.get(type)?.forEach((h) => h(data));
	}

	// ── feature helpers ────────────────────────────────────────────────────

	/** Call when a lynt's detail panel opens so others can see "N viewing". */
	watchLynt(lyntId: string) {
		this.send({ type: 'watch_lynt', lyntId });
	}

	/** Call when the detail panel closes. */
	unwatchLynt() {
		this.send({ type: 'unwatch_lynt' });
	}

	/** Debounced typing indicator — call on every keystroke in a reply box. */
	startTyping(lyntId: string) {
		this.send({ type: 'typing_start', lyntId });
		const existing = this.typingTimers.get(lyntId);
		if (existing) clearTimeout(existing);
		// Auto-stop after 4s of silence so a closed tab doesn't leave a
		// "typing forever" ghost if the close event is ever missed.
		this.typingTimers.set(
			lyntId,
			setTimeout(() => this.stopTyping(lyntId), 4000)
		);
	}

	stopTyping(lyntId: string) {
		const existing = this.typingTimers.get(lyntId);
		if (existing) {
			clearTimeout(existing);
			this.typingTimers.delete(lyntId);
		}
		this.send({ type: 'typing_stop', lyntId });
	}
}

// Singleton — one socket per browser tab, shared across all components.
export const wsClient = new WSClient();
