import assert from "node:assert";
import path from "node:path";
import { describe, test } from "node:test";
import protobuf from "protobufjs";
import WebSocket from "ws";
import { GenericObservable } from "../src/generic-observable";
import { FastMockUpdatesGenerator } from "../src/mock-data-generator";
import { WebSocketServer } from "../src/web-socket";

describe("End-to-End Tests", () => {
	test("should receive positions data as first message upon WebSocket connection", async () => {
		// Arrange
		const port = 8085; // Use unique port to avoid conflicts
		const fastMockUpdatesGenerator = new FastMockUpdatesGenerator();

		// Load protobuf definitions
		const protoPath = path.join(__dirname, "..", "proto", "demo.proto");
		const root = await protobuf.load(protoPath);
		const HeaderData = root.lookupType("HeaderData");
		const PriceUpdates = root.lookupType("PriceUpdates");

		// Create the same setup as main.ts
		const symbolMessage = HeaderData.create(
			fastMockUpdatesGenerator.getPositions(),
		);
		const symbolDataBuffer = HeaderData.encode(symbolMessage).finish();
		const PriceUpdatesStream = new GenericObservable<
			Uint8Array<ArrayBufferLike>
		>(function* () {
			while (true) {
				fastMockUpdatesGenerator.batchUpdate();
				const updatedStocks = fastMockUpdatesGenerator.getUpdatedStocks();
				const message = PriceUpdates.create({
					data: updatedStocks,
				});
				yield PriceUpdates.encode(message).finish();
			}
		});

		const server = new WebSocketServer(symbolDataBuffer, PriceUpdatesStream);

		try {
			// Start the server
			server.listen(port);

			// Give the server a moment to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Act & Assert
			await new Promise<void>((resolve, reject) => {
				const ws = new WebSocket(`ws://localhost:${port}`);
				let messageReceived = false;

				const timeout = setTimeout(() => {
					if (!messageReceived) {
						ws.close();
						reject(new Error("Timeout: No message received within 5 seconds"));
					}
				}, 5000);

				ws.on("open", () => {
					console.log("WebSocket connection opened");
				});

				ws.on("message", (data: Buffer) => {
					if (messageReceived) return; // Only check the first message
					messageReceived = true;
					clearTimeout(timeout);

					try {
						// Decode the protobuf message
						const decoded = HeaderData.decode(data);
						const positionsData = HeaderData.toObject(decoded);

						// Verify the structure of positions data
						assert(
							Array.isArray(positionsData.symbols),
							"symbols should be an array",
						);
						assert(
							Array.isArray(positionsData.names),
							"names should be an array",
						);

						// Verify arrays have the same length
						const length = positionsData.symbols.length;
						assert(
							positionsData.names.length === length,
							"names array should have same length as symbols",
						);

						// Verify arrays are not empty
						assert(length > 0, "positions data should not be empty");

						// Verify data types
						assert(
							typeof positionsData.symbols[0] === "string",
							"symbols should contain strings",
						);
						assert(
							typeof positionsData.names[0] === "string",
							"names should contain strings",
						);

						console.log(
							"✓ First message is valid positions data with",
							length,
							"positions",
						);
						ws.close();
						resolve();
					} catch (error) {
						ws.close();
						reject(error);
					}
				});

				ws.on("error", (error: Error) => {
					clearTimeout(timeout);
					reject(error);
				});

				ws.on("close", () => {
					if (!messageReceived) {
						clearTimeout(timeout);
						reject(new Error("WebSocket closed before receiving any message"));
					}
				});
			});
		} finally {
			// Cleanup
			server.close();
		}
	});

	test("should receive price updates messages after initial positions data", async () => {
		// Arrange
		const port = 8086; // Use unique port to avoid conflicts
		const fastMockUpdatesGenerator = new FastMockUpdatesGenerator();

		// Load protobuf definitions
		const protoPath = path.join(__dirname, "..", "proto", "demo.proto");
		const root = await protobuf.load(protoPath);
		const HeaderData = root.lookupType("HeaderData");
		const PriceUpdates = root.lookupType("PriceUpdates");

		// Create the same setup as main.ts
		const symbolMessage = HeaderData.create(
			fastMockUpdatesGenerator.getPositions(),
		);
		const symbolDataBuffer = HeaderData.encode(symbolMessage).finish();
		const PriceUpdatesStream = new GenericObservable<
			Uint8Array<ArrayBufferLike>
		>(function* () {
			while (true) {
				fastMockUpdatesGenerator.batchUpdate();
				const updatedStocks = fastMockUpdatesGenerator.getUpdatedStocks();
				const message = PriceUpdates.create({
					data: updatedStocks,
				});
				yield PriceUpdates.encode(message).finish();
			}
		});

		const server = new WebSocketServer(symbolDataBuffer, PriceUpdatesStream);

		try {
			// Start the server
			server.listen(port);

			// Give the server a moment to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Act & Assert
			await new Promise<void>((resolve, reject) => {
				const ws = new WebSocket(`ws://localhost:${port}`);
				let messageCount = 0;
				const expectedPriceUpdateMessages = 3; // Check first 3 price update messages after positions

				const timeout = setTimeout(() => {
					ws.close();
					reject(
						new Error(
							"Timeout: Did not receive expected number of messages within 10 seconds",
						),
					);
				}, 10000);

				ws.on("open", () => {
					console.log("WebSocket connection opened");
				});

				ws.on("message", (data: Buffer) => {
					messageCount++;

					try {
						if (messageCount === 1) {
							// First message should be positions data - just verify it's decodable
							const decoded = HeaderData.decode(data);
							const positionsData = HeaderData.toObject(decoded);
							assert(
								positionsData.symbols.length > 0,
								"Positions data should not be empty",
							);
							console.log("✓ Received positions data as first message");
						} else if (messageCount <= expectedPriceUpdateMessages + 1) {
							// Subsequent messages should be price updates
							const decoded = PriceUpdates.decode(data);
							const priceUpdates = PriceUpdates.toObject(decoded);

							// Verify the structure of price updates
							assert(
								Array.isArray(priceUpdates.data),
								"price updates data should be an array",
							);
							assert(
								priceUpdates.data.length > 0,
								"price updates data should not be empty",
							);

							// According to proto comment: 7 values per stock: [symbol, last, change, changePercentage, high, low, volume]
							assert(
								priceUpdates.data.length % 7 === 0,
								"price updates data should contain groups of 7 values per stock",
							);

							// Verify all values are numbers
							for (const value of priceUpdates.data) {
								assert(
									typeof value === "number",
									"all price update values should be numbers",
								);
							}

							const stockCount = priceUpdates.data.length / 7;
							console.log(
								`✓ Message ${messageCount} is valid price updates with ${stockCount} stock updates`,
							);

							if (messageCount === expectedPriceUpdateMessages + 1) {
								clearTimeout(timeout);
								ws.close();
								resolve();
							}
						}
					} catch (error) {
						clearTimeout(timeout);
						ws.close();
						reject(error);
					}
				});

				ws.on("error", (error: Error) => {
					clearTimeout(timeout);
					reject(error);
				});

				ws.on("close", () => {
					if (messageCount < expectedPriceUpdateMessages + 1) {
						clearTimeout(timeout);
						reject(
							new Error(
								`Expected ${expectedPriceUpdateMessages + 1} messages but received ${messageCount}`,
							),
						);
					}
				});
			});
		} finally {
			// Cleanup
			server.close();
		}
	});
});
