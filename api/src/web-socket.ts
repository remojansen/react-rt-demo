import http, { type IncomingMessage } from "node:http";
import WebSocket from "ws";
import type { GenericObservable } from "./generic-observable";

const WS_EVENTS = {
	CONNECTION: "connection",
	MESSAGE: "message",
	CLOSE: "close",
	ERROR: "error",
	PONG: "pong",
} as const;

interface ExtendedWebSocket extends WebSocket {
	isAlive: boolean;
}

export class WebSocketServer {
	private _server: http.Server;
	private _wss: WebSocket.Server;
	private _stream: GenericObservable<Uint8Array<ArrayBufferLike>>;
	private _cancelStreamSubscription?: () => void;
	private _headerData: Uint8Array<ArrayBufferLike>;
	private _isStreamActive: boolean = false;
	private _heartbeatInterval?: NodeJS.Timeout;

	public constructor(
		headerData: Uint8Array<ArrayBufferLike>,
		stream: GenericObservable<Uint8Array<ArrayBufferLike>>,
	) {
		this._headerData = headerData;
		this._server = http.createServer();
		this._wss = new WebSocket.Server({ server: this._server });
		this._stream = stream;
	}

	private _startHeartbeat(): void {
		this._heartbeatInterval = setInterval(() => {
			this._wss.clients.forEach((ws) => {
				const extWs = ws as ExtendedWebSocket;
				if (!extWs.isAlive) {
					console.log("Terminating dead connection");
					extWs.terminate();
					return;
				}

				extWs.isAlive = false;
				extWs.ping();
			});
		}, 30000); // Check every 30 seconds
	}

	private _stopHeartbeat(): void {
		if (this._heartbeatInterval) {
			clearInterval(this._heartbeatInterval);
			this._heartbeatInterval = undefined;
		}
	}

	public listen(port: number): void {
		this._wss.on(
			WS_EVENTS.CONNECTION,
			(ws: WebSocket, _request: IncomingMessage) => {
				const extWs = ws as ExtendedWebSocket;
				extWs.isAlive = true;

				// Send header data immediately upon connection
				ws.send(Buffer.from(this._headerData));

				// Handle pong responses
				extWs.on(WS_EVENTS.PONG, () => {
					extWs.isAlive = true;
				});

				// Start stream subscription only once, when the first client connects
				if (!this._isStreamActive) {
					this._isStreamActive = true;
					this._startHeartbeat();
					this._cancelStreamSubscription = this._stream.subscribe((message) => {
						this._wss.clients.forEach((client) => {
							if (client.readyState === WebSocket.OPEN) {
								client.send(Buffer.from(message));
							}
						});
					});
				}

				ws.on(WS_EVENTS.MESSAGE, () => {
					console.log("Received message from client");
				});

				ws.on(WS_EVENTS.CLOSE, () => {
					console.log("WebSocket connection closed");
					// Stop heartbeat if no more clients
					if (this._wss.clients.size === 0) {
						this._stopHeartbeat();
						this._isStreamActive = false;
						if (this._cancelStreamSubscription) {
							this._cancelStreamSubscription();
							this._cancelStreamSubscription = undefined;
						}
					}
				});

				ws.on(WS_EVENTS.ERROR, (error: Error) => {
					console.error("WebSocket error:", error);
				});
			},
		);

		this._server.listen(port, () => {
			console.log(`WebSocket server is running on port ${port}`);
		});
	}

	public close() {
		this._stopHeartbeat();
		if (this._cancelStreamSubscription) {
			this._cancelStreamSubscription();
			this._cancelStreamSubscription = undefined;
		}
		this._isStreamActive = false;
		this._wss.close();
		this._server.close();
	}
}
