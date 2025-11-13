const IS_DEBUG = false;

class WebSocketSharedWorker {
	constructor() {
		this.connections = new Set();
		this.websocket = null;
		this.protobufRoot = null;
		this.headerDataType = null;
		this.priceUpdatesType = null;
		this.isFirstMessage = true;
		this.wsUrl = "ws://localhost:8080";
		this.headerData = null;
		this.isProtobufReady = false;
		this.pendingMessages = [];

		this.initializeProtobuf();
	}

	async initializeProtobuf() {
		try {
			// Load protobuf.js
			importScripts(
				"https://cdn.jsdelivr.net/npm/protobufjs@7.2.5/dist/protobuf.min.js",
			);

			// Wait a tick to ensure the script is fully loaded
			await new Promise((resolve) => setTimeout(resolve, 0));

			const protobuf = self.protobuf;

			if (!protobuf) {
				throw new Error("Protobuf library not loaded");
			}

			// Load the proto file
			this.protobufRoot = await protobuf.load("/demo.proto");
			this.headerDataType = this.protobufRoot.lookupType("HeaderData");
			this.priceUpdatesType = this.protobufRoot.lookupType("PriceUpdates");

			// Mark as ready
			this.isProtobufReady = true;

			if (IS_DEBUG) console.log("Protobuf initialized successfully");

			// Process any pending messages
			this.processPendingMessages();
		} catch (error) {
			if (IS_DEBUG) console.error("Failed to initialize protobuf:", error);
			this.broadcastError(`Failed to initialize protobuf: ${error.message}`);
		}
	}

	processPendingMessages() {
		while (this.pendingMessages.length > 0) {
			const event = this.pendingMessages.shift();
			this.handleWebSocketMessage(event);
		}
	}

	connect(url = this.wsUrl) {
		if (this.websocket) this.disconnect();

		try {
			if (IS_DEBUG) console.log(`Connecting to WebSocket: ${url}`);
			this.websocket = new WebSocket(url);
			this.websocket.binaryType = "arraybuffer";
			this.isFirstMessage = true;

			this.websocket.onopen = () => {
				if (IS_DEBUG) console.log("WebSocket connected");
				this.broadcastMessage({ type: "connected" });
			};

			this.websocket.onmessage = (event) => {
				this.handleWebSocketMessage(event);
			};

			this.websocket.onclose = (event) => {
				if (IS_DEBUG)
					console.log("WebSocket closed:", event.code, event.reason);
				this.broadcastMessage({ type: "disconnected" });
			};

			this.websocket.onerror = (error) => {
				if (IS_DEBUG) console.error("WebSocket error:", error);
				this.broadcastError("WebSocket connection error");
			};
		} catch (error) {
			this.broadcastError(`Failed to connect: ${error.message}`);
		}
	}

	disconnect() {
		if (this.websocket) {
			this.websocket.close();
			this.websocket = null;
		}
		// Clear pending messages on disconnect
		this.pendingMessages = [];
	}

	handleWebSocketMessage(event) {
		try {
			// If protobuf is not ready yet, queue the message
			if (!this.isProtobufReady) {
				this.pendingMessages.push(event);
				return;
			}

			if (
				!this.protobufRoot ||
				!this.headerDataType ||
				!this.priceUpdatesType
			) {
				throw new Error("Protobuf types not properly initialized");
			}

			const arrayBuffer = event.data;
			const uint8Array = new Uint8Array(arrayBuffer);

			if (this.isFirstMessage) {
				const decodedMessage = this.headerDataType.decode(uint8Array);
				this.isFirstMessage = false;
				this.headerData = decodedMessage;

				if (IS_DEBUG) {
					console.log("Header message decoded:", decodedMessage);
				}

				this.broadcastMessage({
					type: "header",
					data: decodedMessage,
				});
			} else {
				const decodedMessage = this.priceUpdatesType.decode(uint8Array);

				if (IS_DEBUG) {
					console.log("Price update decoded:", decodedMessage);
				}

				// Broadcast RAW data only - no P&L calculations
				this.broadcastMessage({
					type: "update",
					data: {
						data: decodedMessage.data,
						timestamp: Date.now(),
					},
				});
			}
		} catch (error) {
			if (IS_DEBUG) console.error("Message handling error:", error);
			this.broadcastError(`Failed to decode message: ${error.message}`);
		}
	}

	broadcastMessage(message) {
		this.connections.forEach((port) => {
			try {
				port.postMessage(message);
			} catch (_error) {
				this.connections.delete(port);
			}
		});
	}

	broadcastError(errorMessage) {
		this.broadcastMessage({
			type: "error",
			data: { message: errorMessage },
		});
	}

	addConnection(port) {
		this.connections.add(port);

		port.onmessage = (event) => {
			const { type, url } = event.data;

			switch (type) {
				case "connect":
					this.connect(url);
					break;
				case "disconnect":
					this.disconnect();
					break;
			}
		};

		port.postMessage({ type: "worker-ready" });
	}

	removeConnection(port) {
		this.connections.delete(port);
		if (this.connections.size === 0) {
			this.disconnect();
		}
	}
}

// Create worker instance
const worker = new WebSocketSharedWorker();

self.addEventListener("connect", (event) => {
	const port = event.ports[0];
	worker.addConnection(port);

	port.addEventListener("close", () => {
		worker.removeConnection(port);
	});

	port.start();
});
