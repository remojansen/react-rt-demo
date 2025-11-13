import { useCallback, useEffect, useRef, useState } from "react";
import { usePositions } from "./user-positions";

export interface PLHeader {
	names: string[];
	symbols: string[];
}

export interface PLAggregates {
	pnlAmount: number;
	pnlPercentage: number;
	pCount: number;
	lCount: number;
}

export type PLUpdate = {
	data: number[];
	aggregates: PLAggregates;
	timestamp: number;
};

export type PLMessage =
	| { type: "header"; data: PLHeader }
	| { type: "update"; data: PLUpdate }
	| { type: "error"; data: { message: string } };

export function useProfitAndLossData() {
	const { positions } = usePositions();
	const [_sharedWorker, setSharedWorker] = useState<SharedWorker | null>(null);
	const [sharedWorkerPort, setSharedWorkerPort] = useState<MessagePort | null>(
		null,
	);
	const [pnlWorker, setPnlWorker] = useState<Worker | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const subscribersRef = useRef<Set<(message: PLMessage) => void>>(new Set());
	const headerDataRef = useRef<PLHeader | null>(null);

	// Initialize workers
	useEffect(() => {
		let wsSharedWorker: SharedWorker | null = null;
		let wsPort: MessagePort | null = null;
		let calculatorWorker: Worker | null = null;

		const initializeWorkers = async () => {
			try {
				setError(null);

				// Initialize WebSocket shared worker
				wsSharedWorker = new SharedWorker(
					"/workers/websocket-shared-worker.js",
				);
				wsPort = wsSharedWorker.port;

				// Initialize P&L calculation dedicated worker
				calculatorWorker = new Worker("/workers/pnl-calculator-worker.js");

				// Set up shared worker communication
				wsPort.onmessage = (event) => {
					const { type, data } = event.data;

					switch (type) {
						case "connected":
							setIsConnected(true);
							break;

						case "disconnected":
							setIsConnected(false);
							break;

						case "header":
							headerDataRef.current = data;
							// Send header to P&L worker
							calculatorWorker?.postMessage({
								type: "set-header",
								data: { headerData: data },
							});
							// Broadcast header to subscribers
							subscribersRef.current.forEach((callback) => {
								callback({ type: "header", data });
							});
							break;

						case "update":
							// Send raw data to P&L worker for calculation
							calculatorWorker?.postMessage({
								type: "calculate-pnl",
								data: { rawData: data.data, timestamp: data.timestamp },
							});
							break;

						case "error":
							setError(data.message);
							subscribersRef.current.forEach((callback) => {
								callback({ type: "error", data });
							});
							break;
					}
				};

				// Set up P&L worker communication
				calculatorWorker.onmessage = (event) => {
					const { type, data } = event.data;

					if (type === "pnl-calculated") {
						// Broadcast enhanced data with aggregates to subscribers
						subscribersRef.current.forEach((callback) => {
							callback({ type: "update", data });
						});
					}
				};

				// Set up error handlers
				wsSharedWorker.onerror = (event) => {
					setError(`WebSocket worker error: ${event.message}`);
				};

				calculatorWorker.onerror = (event) => {
					setError(`P&L worker error: ${event.message}`);
				};

				// Start the port
				wsPort.start();

				setSharedWorker(wsSharedWorker);
				setSharedWorkerPort(wsPort);
				setPnlWorker(calculatorWorker);
			} catch (error) {
				setError(`Failed to initialize workers: ${error}`);
			}
		};

		initializeWorkers();

		return () => {
			wsPort?.close();
			calculatorWorker?.terminate();
		};
	}, []);

	// Update positions in P&L worker when they change
	useEffect(() => {
		if (pnlWorker && positions.length > 0) {
			pnlWorker.postMessage({
				type: "set-positions",
				data: { positions },
			});
		}
	}, [pnlWorker, positions]);

	const connect = useCallback(() => {
		if (sharedWorkerPort) {
			sharedWorkerPort.postMessage({
				type: "connect",
				url: "ws://localhost:8080",
			});
		}
	}, [sharedWorkerPort]);

	const disconnect = useCallback(() => {
		if (sharedWorkerPort) {
			sharedWorkerPort.postMessage({ type: "disconnect" });
		}
	}, [sharedWorkerPort]);

	const subscribe = useCallback((callback: (message: PLMessage) => void) => {
		subscribersRef.current.add(callback);
		return () => {
			subscribersRef.current.delete(callback);
		};
	}, []);

	return {
		isConnected,
		error,
		connect,
		disconnect,
		subscribe,
	};
}
