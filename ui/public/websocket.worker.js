// Import protobuf via importScripts for Web Worker compatibility
importScripts("https://unpkg.com/protobufjs@7.5.4/dist/protobuf.min.js");
// Shared worker implementation
class WebSocketSharedWorker {
    constructor() {
        this.ws = null;
        this.tradingUpdatesType = null;
        this.symbolDataType = null;
        this.ports = [];
        this.connectionStatus = "disconnected";
        this.loadProtobufSchemas();
    }
    async loadProtobufSchemas() {
        try {
            const root = await protobuf.load("/demo.proto");
            this.tradingUpdatesType = root.lookupType("TradingUpdates");
            this.symbolDataType = root.lookupType("SymbolData");
        }
        catch (error) {
            console.error("Failed to load protobuf schemas:", error);
        }
    }
    addPort(port) {
        this.ports.push(port);
        port.onmessage = (event) => this.handleMessage(event.data, port);
        // Send current status to new port
        port.postMessage({
            type: "STATUS",
            status: this.connectionStatus,
        });
    }
    removePort(port) {
        const index = this.ports.indexOf(port);
        if (index !== -1) {
            this.ports.splice(index, 1);
        }
        // If no more ports, disconnect WebSocket
        if (this.ports.length === 0) {
            this.disconnect();
        }
    }
    handleMessage(message, _port) {
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
    async connect(url) {
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
        }
        catch (error) {
            console.error("WebSocket connection failed:", error);
            this.updateStatus("error");
        }
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.updateStatus("disconnected");
    }
    async handleWebSocketMessage(event) {
        if (event.data instanceof Blob) {
            try {
                const buffer = await event.data.arrayBuffer();
                const uint8Array = new Uint8Array(buffer);
                // Try to decode as TradingUpdates first
                if (this.tradingUpdatesType) {
                    try {
                        const tradingData = this.tradingUpdatesType.decode(uint8Array);
                        const payload = {
                            type: "UPDATE",
                            data: tradingData,
                        };
                        this.broadcastToAllPorts(payload);
                        return;
                    }
                    catch {
                        // If TradingUpdates decoding fails, try SymbolData
                    }
                }
                // Try to decode as SymbolData
                if (this.symbolDataType) {
                    try {
                        const symbolData = this.symbolDataType.decode(uint8Array);
                        const payload = {
                            type: "HEADER",
                            data: symbolData,
                        };
                        this.broadcastToAllPorts(payload);
                        return;
                    }
                    catch {
                        console.error("Failed to decode message as either TradingUpdates or SymbolData");
                    }
                }
            }
            catch (error) {
                console.error("Error processing WebSocket message:", error);
            }
        }
    }
    updateStatus(status) {
        this.connectionStatus = status;
        const payload = {
            type: "STATUS",
            status,
        };
        this.broadcastToAllPorts(payload);
    }
    broadcastToAllPorts(message) {
        this.ports.forEach((port) => {
            try {
                port.postMessage(message);
            }
            catch (error) {
                console.error("Error sending message to port:", error);
            }
        });
    }
}
// Initialize the shared worker
const worker = new WebSocketSharedWorker();
// Handle new connections
self.addEventListener("connect", (event) => {
    const connectEvent = event;
    const port = connectEvent.ports[0];
    worker.addPort(port);
    port.addEventListener("close", () => {
        worker.removePort(port);
    });
    port.start();
});
