import http, { type IncomingMessage } from "node:http";
import WebSocket from "ws";
import type { GenericObservable } from "./generic-observable";

const WS_EVENTS = {
	CONNECTION: "connection",
	MESSAGE: "message",
	CLOSE: "close",
	ERROR: "error",
} as const;

export class WebSocketServer {
	private _server: http.Server;
	private _wss: WebSocket.Server;
	private _stream: GenericObservable<Uint8Array<ArrayBufferLike>>;
	private _cancelStreamSubscription?: () => void;

	public constructor(stream: GenericObservable<Uint8Array<ArrayBufferLike>>) {
		this._server = http.createServer();
		this._wss = new WebSocket.Server({ server: this._server });
		this._stream = stream;
	}

	public listen(port: number): void {
		this._wss.on(
			WS_EVENTS.CONNECTION,
			(ws: WebSocket, _request: IncomingMessage) => {
				// Send header data immediately upon connection (e.g. symbols and names)
				ws.send(this._stream.headerData);

				// Subscribe to the data stream and forward messages to the client
				this._cancelStreamSubscription = this._stream.subscribe((message) => {
					this._wss.clients.forEach((client) => {
						if (client.readyState === WebSocket.OPEN) {
							client.send(message);
						}
					});
				});

				ws.on(WS_EVENTS.MESSAGE, () => {
					console.log("Received message from client");
				});

				ws.on(WS_EVENTS.CLOSE, () => {
					console.log("WebSocket connection closed");
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

	close() {
		if (this._cancelStreamSubscription) {
			this._cancelStreamSubscription();
		}
		this._wss.close();
		this._server.close();
	}
}
