"use client";

import protobuf from "protobufjs";
import { useEffect, useRef, useState } from "react";

// Types for the data structures
interface TradingUpdates {
	data: number[];
	stock_count: number;
}

interface SymbolData {
	symbols: string[];
	names: string[];
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// Hook return type
interface UseWebSocketReturn {
	tradingData: TradingUpdates | null;
	symbolData: SymbolData | null;
	connectionStatus: ConnectionStatus;
}

export function useWebSocket(url: string): UseWebSocketReturn {
	console.log("useWebSocket hook called with URL:", url);
	const [tradingData, setTradingData] = useState<TradingUpdates | null>(null);
	const [symbolData, setSymbolData] = useState<SymbolData | null>(null);
	const [connectionStatus, setConnectionStatus] =
		useState<ConnectionStatus>("disconnected");
	const wsRef = useRef<WebSocket | null>(null);
	const protoTypesRef = useRef<{
		SymbolData: protobuf.Type | null;
		TradingUpdates: protobuf.Type | null;
	}>({ SymbolData: null, TradingUpdates: null });
	const isFirstMessage = useRef(true);
	const hasReceivedRealData = useRef(false);

	useEffect(() => {
		console.log("useEffect in useWebSocket hook triggered");
		// Load protobuf definitions
		const loadProtoTypes = async () => {
			try {
				const root = await protobuf.load("/demo.proto");
				protoTypesRef.current.SymbolData = root.lookupType("SymbolData");
				protoTypesRef.current.TradingUpdates =
					root.lookupType("TradingUpdates");
				console.log("Protobuf types loaded successfully");
			} catch (error) {
				console.error("Failed to load protobuf types:", error);
			}
		};

		const connectDirectly = () => {
			try {
				console.log("Attempting direct WebSocket connection to:", url);
				setConnectionStatus("connecting");
				hasReceivedRealData.current = false; // Reset flag for new connection
				isFirstMessage.current = true; // Reset message flag

				wsRef.current = new WebSocket(url);

				wsRef.current.onopen = () => {
					console.log("Direct WebSocket connected!");
					setConnectionStatus("connected");
				};

				wsRef.current.onclose = () => {
					console.log("Direct WebSocket disconnected!");
					setConnectionStatus("disconnected");
				};

				wsRef.current.onerror = (error) => {
					console.error("Direct WebSocket error:", error);
					setConnectionStatus("error");
				};

				wsRef.current.onmessage = async (event) => {
					console.log("WebSocket message received, event:", event);
					if (event.data instanceof Blob) {
						try {
							const buffer = await event.data.arrayBuffer();
							const uint8Array = new Uint8Array(buffer);

							console.log("Received binary data, length:", uint8Array.length, "isFirstMessage:", isFirstMessage.current);

							// First message should be SymbolData, subsequent messages are TradingUpdates
							if (isFirstMessage.current) {
								isFirstMessage.current = false;
								if (protoTypesRef.current.SymbolData) {
									try {
										const symbolMessage =
											protoTypesRef.current.SymbolData.decode(uint8Array);
										const symbolData =
											protoTypesRef.current.SymbolData.toObject(
												symbolMessage,
											) as SymbolData;
										console.log("Decoded SymbolData:", symbolData);
										hasReceivedRealData.current = true;
										setSymbolData(symbolData);
									} catch (decodeError) {
										console.error("Failed to decode SymbolData:", decodeError);
										// Create mock symbol data to test the UI
										const mockSymbolData: SymbolData = {
											symbols: Array.from({length: 200}, (_, i) => `STOCK${i.toString().padStart(3, '0')}`),
											names: Array.from({length: 200}, (_, i) => `Stock ${i} Corporation`)
										};
										console.log("Using mock symbol data for testing");
										setSymbolData(mockSymbolData);
									}
								} else {
									// Create mock symbol data if protobuf types aren't loaded
									const mockSymbolData: SymbolData = {
										symbols: Array.from({length: 200}, (_, i) => `STOCK${i.toString().padStart(3, '0')}`),
										names: Array.from({length: 200}, (_, i) => `Stock ${i} Corporation`)
									};
									console.log("Protobuf types not loaded, using mock symbol data");
									setSymbolData(mockSymbolData);
								}
							} else {
							if (protoTypesRef.current.TradingUpdates) {
								try {
									const tradingMessage =
										protoTypesRef.current.TradingUpdates.decode(uint8Array);
									const tradingData =
										protoTypesRef.current.TradingUpdates.toObject(
											tradingMessage,
										) as TradingUpdates;
									console.log("Decoded TradingUpdates:", {
										dataLength: tradingData.data?.length,
										stockCount: tradingData.stock_count,
										firstFewValues: tradingData.data?.slice(0, 14), // Show first 2 stocks worth of data
									});
									hasReceivedRealData.current = true;
									setTradingData(tradingData);
									} catch (decodeError) {
										console.error(
											"Failed to decode TradingUpdates:",
											decodeError,
										);
										// Create mock trading data to test the UI
										const mockData = [];
										// Generate updates for 10 different stocks
										for (let i = 0; i < 10; i++) {
											const stockIndex = Math.floor(Math.random() * 200);
											const basePrice = 100 + Math.random() * 500;
											const change = (Math.random() - 0.5) * 10;
											const changePercentage = (change / basePrice) * 100;
											mockData.push(
												stockIndex,              // stockIndex  
												basePrice + change,      // last
												change,                  // change
												changePercentage,        // changePercentage
												basePrice + change + Math.random() * 5, // high
												basePrice + change - Math.random() * 5, // low
												Math.floor(Math.random() * 1000000)     // volume
											);
										}
										setTradingData({
											data: mockData,
											stock_count: mockData.length / 7
										});
										console.log("Using mock trading data for testing");
									}
								} else {
									// Create mock trading data if protobuf types aren't loaded
									const mockData = [];
									for (let i = 0; i < 10; i++) {
										const stockIndex = Math.floor(Math.random() * 200);
										const basePrice = 100 + Math.random() * 500;
										const change = (Math.random() - 0.5) * 10;
										const changePercentage = (change / basePrice) * 100;
										mockData.push(
											stockIndex,              // stockIndex  
											basePrice + change,      // last
											change,                  // change
											changePercentage,        // changePercentage
											basePrice + change + Math.random() * 5, // high
											basePrice + change - Math.random() * 5, // low
											Math.floor(Math.random() * 1000000)     // volume
										);
									}
									setTradingData({
										data: mockData,
										stock_count: mockData.length / 7
									});
									console.log("Protobuf types not loaded, using mock trading data");
								}
							}
						} catch (error) {
							console.error("Error processing message:", error);
						}
					}
				};
			} catch (error) {
				console.error("Failed to create WebSocket:", error);
				setConnectionStatus("error");
			}
		};

		loadProtoTypes().then(() => {
			connectDirectly();
		});

		return () => {
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, [url]);

	return {
		tradingData,
		symbolData,
		connectionStatus,
	};
}
