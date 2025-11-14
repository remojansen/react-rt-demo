const IS_DEBUG = false;

// Runtime backpressure configuration
const BACKPRESSURE_CONFIG = {
    // Maximum number of messages to buffer during runtime processing
    maxBufferSize: 100,
    
    // Dropping strategy when buffer is full
    // 'drop-oldest': Remove oldest messages (FIFO)
    // 'drop-newest': Discard new messages
    // 'drop-middle': Keep first and last N messages, drop middle
    dropStrategy: 'drop-oldest',
    
    // For drop-middle strategy: how many messages to keep at start/end
    keepAtEdges: 10,
    
    // Enable buffer usage metrics
    enableMetrics: IS_DEBUG,
    
    // Warn when buffer usage exceeds this threshold
    warningThreshold: 0.8
};

class CircularBuffer {
    constructor(config = BACKPRESSURE_CONFIG) {
        this.config = config;
        this.buffer = [];
        this.droppedCount = 0;
        this.totalReceived = 0;
        this.peakBufferSize = 0;
        this.lastWarningTime = 0;
    }

    add(message) {
        this.totalReceived++;
        
        // If buffer has space, just add the message
        if (this.buffer.length < this.config.maxBufferSize) {
            this.buffer.push(message);
            this.updatePeakSize();
            return true;
        }

        // Buffer is full, apply dropping strategy
        this.droppedCount++;
        
        switch (this.config.dropStrategy) {
            case 'drop-oldest':
                this.buffer.shift(); // Remove oldest
                this.buffer.push(message); // Add newest
                break;
                
            case 'drop-newest':
                // Just discard the new message, keep existing buffer
                break;
                
            case 'drop-middle':
                this.dropMiddleStrategy(message);
                break;
                
            default:
                // Fallback to drop-oldest
                this.buffer.shift();
                this.buffer.push(message);
        }

        this.checkWarningThreshold();
        return false; // Indicates message was dropped or caused dropping
    }

    dropMiddleStrategy(newMessage) {
        const keepCount = this.config.keepAtEdges;
        const totalToKeep = keepCount * 2;
        
        if (totalToKeep >= this.config.maxBufferSize) {
            // If keepAtEdges is too large, fallback to drop-oldest
            this.buffer.shift();
            this.buffer.push(newMessage);
            return;
        }

        // Keep first N and last N messages, drop everything in between
        const firstPart = this.buffer.slice(0, keepCount);
        const lastPart = this.buffer.slice(-keepCount);
        this.buffer = [...firstPart, ...lastPart, newMessage];
    }

    getNext() {
        return this.buffer.shift();
    }

    peek() {
        return this.buffer[0];
    }

    isEmpty() {
        return this.buffer.length === 0;
    }

    size() {
        return this.buffer.length;
    }

    clear() {
        this.buffer = [];
        this.resetMetrics();
    }

    updatePeakSize() {
        this.peakBufferSize = Math.max(this.peakBufferSize, this.buffer.length);
    }

    checkWarningThreshold() {
        const usageRatio = this.buffer.length / this.config.maxBufferSize;
        const now = Date.now();
        
        // Only warn once every 5 seconds to avoid spam
        if (usageRatio >= this.config.warningThreshold && 
            now - this.lastWarningTime > 5000) {
            
            this.lastWarningTime = now;
            
            if (IS_DEBUG) {
                console.warn(`Runtime backpressure warning: Buffer usage at ${Math.round(usageRatio * 100)}% (${this.buffer.length}/${this.config.maxBufferSize})`);
            }
        }
    }

    getMetrics() {
        if (!this.config.enableMetrics) return null;
        
        return {
            currentSize: this.buffer.length,
            maxSize: this.config.maxBufferSize,
            peakSize: this.peakBufferSize,
            totalReceived: this.totalReceived,
            totalDropped: this.droppedCount,
            dropRate: this.totalReceived > 0 ? this.droppedCount / this.totalReceived : 0,
            usageRatio: this.buffer.length / this.config.maxBufferSize,
            strategy: this.config.dropStrategy
        };
    }

    resetMetrics() {
        this.droppedCount = 0;
        this.totalReceived = 0;
        this.peakBufferSize = 0;
        this.lastWarningTime = 0;
    }
}

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
        
        // Initialization backpressure (existing)
        this.pendingMessages = [];
        
        // Runtime backpressure (new)
        this.runtimeBuffer = new CircularBuffer();
        this.isProcessing = false;

        this.initializeProtobuf();
        
        // Start the runtime message processor
        this.startRuntimeProcessor();
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

    // New: Runtime message processor using requestIdleCallback for better performance
    startRuntimeProcessor() {
        const processMessages = () => {
            if (this.isProcessing) return;
            
            this.isProcessing = true;
            
            try {
                // Process messages while we have time in this frame
                const startTime = performance.now();
                const maxProcessingTime = 8; // Max 8ms per frame to maintain 60fps
                
                let processedCount = 0;
                while (!this.runtimeBuffer.isEmpty() && 
                       (performance.now() - startTime) < maxProcessingTime) {
                    
                    const event = this.runtimeBuffer.getNext();
                    this.processRuntimeMessage(event);
                    processedCount++;
                }
                
                if (IS_DEBUG && processedCount > 0) {
                    console.log(`Processed ${processedCount} runtime messages in ${Math.round(performance.now() - startTime)}ms`);
                }
                
            } finally {
                this.isProcessing = false;
            }
            
            // Schedule next processing cycle
            if ('requestIdleCallback' in self) {
                requestIdleCallback(processMessages, { timeout: 16 }); // 60fps fallback
            } else {
                setTimeout(processMessages, 0);
            }
        };
        
        // Start the processor
        if ('requestIdleCallback' in self) {
            requestIdleCallback(processMessages);
        } else {
            setTimeout(processMessages, 0);
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
        
        // Clear both initialization and runtime buffers on disconnect
        this.pendingMessages = [];
        this.runtimeBuffer.clear();
    }

    handleWebSocketMessage(event) {
        try {
            // Initialization backpressure: If protobuf is not ready yet, queue the message
            if (!this.isProtobufReady) {
                this.pendingMessages.push(event);
                return;
            }

            // Runtime backpressure: Add to runtime buffer for processing
            const wasAccepted = this.runtimeBuffer.add(event);
            
            if (!wasAccepted && IS_DEBUG) {
                const metrics = this.runtimeBuffer.getMetrics();
                console.warn('Runtime message dropped due to backpressure:', metrics);
            }
            
        } catch (error) {
            if (IS_DEBUG) console.error("Message queuing error:", error);
            this.broadcastError(`Failed to queue message: ${error.message}`);
        }
    }

    // Process messages from the runtime buffer
    processRuntimeMessage(event) {
        try {
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
            if (IS_DEBUG) console.error("Runtime message processing error:", error);
            this.broadcastError(`Failed to process message: ${error.message}`);
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

    // New: Expose backpressure metrics
    getBackpressureMetrics() {
        return {
            initialization: {
                pendingCount: this.pendingMessages.length,
                isReady: this.isProtobufReady
            },
            runtime: this.runtimeBuffer.getMetrics()
        };
    }

    // New: Update backpressure configuration at runtime
    updateBackpressureConfig(newConfig) {
        Object.assign(BACKPRESSURE_CONFIG, newConfig);
        
        // Create new buffer with updated config
        const oldBuffer = this.runtimeBuffer;
        this.runtimeBuffer = new CircularBuffer(BACKPRESSURE_CONFIG);
        
        // Transfer existing messages to new buffer
        while (!oldBuffer.isEmpty()) {
            this.runtimeBuffer.add(oldBuffer.getNext());
        }
        
        if (IS_DEBUG) {
            console.log('Backpressure configuration updated:', BACKPRESSURE_CONFIG);
        }
    }

    addConnection(port) {
        this.connections.add(port);

        port.onmessage = (event) => {
            const { type, url, config } = event.data;

            switch (type) {
                case "connect":
                    this.connect(url);
                    break;
                case "disconnect":
                    this.disconnect();
                    break;
                case "get-backpressure-metrics":
                    port.postMessage({
                        type: "backpressure-metrics",
                        data: this.getBackpressureMetrics()
                    });
                    break;
                case "update-backpressure-config":
                    this.updateBackpressureConfig(config);
                    port.postMessage({
                        type: "backpressure-config-updated",
                        data: BACKPRESSURE_CONFIG
                    });
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