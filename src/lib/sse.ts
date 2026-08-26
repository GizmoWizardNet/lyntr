export {
	getOnlineUserIds,
	sendToUser,
	broadcastNewLynt,
	sendMessage,
	broadcastLikeUpdate,
	broadcastRepostUpdate,
	broadcastCommentCountUpdate,
	broadcastLyntDeleted,
	broadcastPollUpdate,
	broadcastNewCommentToViewers,
	broadcastLyntEdited,
	broadcastReactionUpdate,
	onlineUserIds
} from './ws';

// addConnection/removeConnection no longer apply (WebSocket lifecycle is
// handled entirely inside ws.ts's attachWebSocketServer). They're kept as
// harmless no-ops in case anything still imports them directly.
export function addConnection(..._args: any[]) {
	console.warn('[sse.ts shim] addConnection() is a no-op — SSE has been replaced by WebSockets.');
}
export function removeConnection(..._args: any[]) {
	console.warn('[sse.ts shim] removeConnection() is a no-op — SSE has been replaced by WebSockets.');
}
