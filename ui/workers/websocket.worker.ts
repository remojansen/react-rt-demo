// Type declaration for Web Worker globals
declare function importScripts(...urls: string[]): void;

// Import protobuf via importScripts for Web Worker compatibility
importScripts("https://unpkg.com/protobufjs@7.5.4/dist/protobuf.min.js");

// Forward declarations for protobuf types
interface TradingUpdates {
	data: number[];
	stock_count: number;
}

interface SymbolData {
	symbols: string[];
	names: string[];
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// Message types for communication with the main thread
interface WorkerMessage {
	type: "CONNECT" | "DISCONNECT";
	url?: string;
}

interface WorkerResponse {
	type: "STATUS" | "UPDATE" | "HEADER";
	status?: ConnectionStatus;
	data?: TradingUpdates | SymbolData;
}

// Shared worker implementation
class WebSocketSharedWorker {
	private ws: WebSocket | null = null;
	private tradingUpdatesType: protobuf.Type | null = null;
	private symbolDataType: protobuf.Type | null = null;
	private ports: MessagePort[] = [];
	private connectionStatus: ConnectionStatus = "disconnected";

	constructor() {
		this.loadProtobufSchemas();
	}

	private async loadProtobufSchemas() {
		try {
			const root = await protobuf.load("/demo.proto");
			this.tradingUpdatesType = root.lookupType("TradingUpdates");
			this.symbolDataType = root.lookupType("SymbolData");
		} catch (error) {
			console.error("Failed to load protobuf schemas:", error);
		}
	}

	public addPort(port: MessagePort) {
		this.ports.push(port);
		port.onmessage = (event) => this.handleMessage(event.data, port);

		// Send current status to new port
		port.postMessage({
			type: "STATUS",
			status: this.connectionStatus,
		} as WorkerResponse);
	}

	public removePort(port: MessagePort) {
		const index = this.ports.indexOf(port);
		if (index !== -1) {
			this.ports.splice(index, 1);
		}

		// If no more ports, disconnect WebSocket
		if (this.ports.length === 0) {
			this.disconnect();
		}
	}

	private handleMessage(message: WorkerMessage, _port: MessagePort) {
		switch (message.type) {
			case "CONNECT":
				if (message.url) {
					this.connect(message.url);
				}
				break;
			case "DISCONNECT":
				this.disconnect();
				break;
		}
	}

	private async connect(url: string) {
		console.log("SharedWorker: Attempting to connect to:", url);
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			console.log("SharedWorker: Already connected");
			return; // Already connected
		}

		try {
			console.log("SharedWorker: Updating status to connecting");
			this.updateStatus("connecting");

			// Ensure protobuf schemas are loaded
			if (!this.tradingUpdatesType || !this.symbolDataType) {
				console.log("SharedWorker: Loading protobuf schemas");
				await this.loadProtobufSchemas();
			}

			console.log("SharedWorker: Creating WebSocket connection");
			this.ws = new WebSocket(url);

			this.ws.onopen = () => {
				console.log("SharedWorker: WebSocket connection opened");
				this.updateStatus("connected");
			};

			this.ws.onmessage = (event) => {
				console.log("SharedWorker: Received message:", event);
				this.handleWebSocketMessage(event);
			};

			this.ws.onclose = (event) => {
				console.log("SharedWorker: WebSocket connection closed:", event);
				this.updateStatus("disconnected");
			};

			this.ws.onerror = (error) => {
				console.log("SharedWorker: WebSocket error:", error);
				this.updateStatus("error");
			};
		} catch (error) {
			console.error("WebSocket connection failed:", error);
			this.updateStatus("error");
		}
	}

	private disconnect() {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.updateStatus("disconnected");
	}

	private async handleWebSocketMessage(event: MessageEvent) {
		if (event.data instanceof Blob) {
			try {
				const buffer = await event.data.arrayBuffer();
				const uint8Array = new Uint8Array(buffer);

				// Try to decode as TradingUpdates first
				if (this.tradingUpdatesType) {
					try {
						const tradingData = this.tradingUpdatesType.decode(
							uint8Array,
						) as unknown as TradingUpdates;
						const payload: WorkerResponse = {
							type: "UPDATE",
							data: tradingData,
						};
						this.broadcastToAllPorts(payload);
						return;
					} catch {
						// If TradingUpdates decoding fails, try SymbolData
					}
				}

				// Try to decode as SymbolData
				if (this.symbolDataType) {
					try {
						const symbolData = this.symbolDataType.decode(
							uint8Array,
						) as unknown as SymbolData;
						const payload: WorkerResponse = {
							type: "HEADER",
							data: symbolData,
						};
						this.broadcastToAllPorts(payload);
						return;
					} catch {
						console.error(
							"Failed to decode message as either TradingUpdates or SymbolData",
						);
					}
				}
			} catch (error) {
				console.error("Error processing WebSocket message:", error);
			}
		}
	}

	private updateStatus(status: ConnectionStatus) {
		this.connectionStatus = status;
		const payload: WorkerResponse = {
			type: "STATUS",
			status,
		};
		this.broadcastToAllPorts(payload);
	}

	private broadcastToAllPorts(message: WorkerResponse) {
		this.ports.forEach((port) => {
			try {
				port.postMessage(message);
			} catch (error) {
				console.error("Error sending message to port:", error);
			}
		});
	}
}

// Initialize the shared worker
const worker = new WebSocketSharedWorker();

// Handle new connections
self.addEventListener("connect", (event: Event) => {
	const connectEvent = event as MessageEvent;
	const port = connectEvent.ports[0];
	worker.addPort(port);

	port.addEventListener("close", () => {
		worker.removePort(port);
	});

	port.start();
});
