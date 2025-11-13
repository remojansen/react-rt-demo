import assert from "node:assert";
import { describe, test } from "node:test";
import WebSocket from "ws";
import { GenericObservable } from "../src/generic-observable";
import { WebSocketServer } from "../src/web-socket";

describe("WebSocketServer", () => {
	test("should send header data as first message when connection is established", async () => {
		// Arrange
		const port = 8081;
		const headerData = new Uint8Array([1, 2, 3, 4, 5]);
		const mockStream = new GenericObservable<Uint8Array<ArrayBufferLike>>(() =>
			(function* () {})(),
		);
		const server = new WebSocketServer(headerData, mockStream);

		try {
			// Start the server
			server.listen(port);

			// Give the server a moment to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Act & Assert
			await new Promise<void>((resolve, reject) => {
				const client = new WebSocket(`ws://localhost:${port}`);

				client.on("message", (data) => {
					try {
						// Verify the first message is the header data
						const receivedData = new Uint8Array(data as Buffer);
						assert.deepStrictEqual(receivedData, headerData);
						client.close();
						resolve();
					} catch (error) {
						client.close();
						reject(error);
					}
				});

				client.on("error", (error) => {
					reject(error);
				});

				client.on("close", () => {
					// Connection closed before receiving message
					if (!client.readyState) {
						reject(new Error("Connection closed before receiving header data"));
					}
				});
			});
		} finally {
			// Cleanup
			server.close();
		}
	});

	test("should send update data as second message from stream", async () => {
		// Arrange
		const port = 8082;
		const headerData = new Uint8Array([1, 2, 3, 4, 5]);
		const updateData = new Uint8Array([10, 20, 30, 40, 50]);

		// Create a mock stream that yields one update
		const mockStream = new GenericObservable<Uint8Array<ArrayBufferLike>>(() =>
			(function* () {
				yield updateData;
			})(),
		);

		const server = new WebSocketServer(headerData, mockStream);

		try {
			// Start the server
			server.listen(port);

			// Give the server a moment to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Act & Assert
			await new Promise<void>((resolve, reject) => {
				const client = new WebSocket(`ws://localhost:${port}`);
				let messageCount = 0;

				client.on("message", (data) => {
					try {
						messageCount++;
						const receivedData = new Uint8Array(data as Buffer);

						if (messageCount === 1) {
							// First message should be header data
							assert.deepStrictEqual(receivedData, headerData);
						} else if (messageCount === 2) {
							// Second message should be update data from stream
							assert.deepStrictEqual(receivedData, updateData);
							client.close();
							resolve();
						}
					} catch (error) {
						client.close();
						reject(error);
					}
				});

				client.on("error", (error) => {
					reject(error);
				});

				client.on("close", () => {
					if (messageCount < 2) {
						reject(
							new Error(`Expected 2 messages but received ${messageCount}`),
						);
					}
				});

				// Set a timeout to avoid hanging if the second message doesn't arrive
				setTimeout(() => {
					if (messageCount < 2) {
						client.close();
						reject(new Error("Timeout waiting for second message"));
					}
				}, 2000);
			});
		} finally {
			// Cleanup
			server.close();
		}
	});

	test("should send updates at 100MHz frequency", async () => {
		// Arrange
		const port = 8083;
		const headerData = new Uint8Array([1, 2, 3, 4, 5]);
		const expectedFrequency = 100; // 100 Hz
		const expectedInterval = 1000 / expectedFrequency; // 10ms
		const tolerance = 5; // 5ms tolerance

		// Create a mock stream that yields multiple updates
		const mockStream = new GenericObservable<Uint8Array<ArrayBufferLike>>(() =>
			(function* () {
				for (let i = 0; i < 10; i++) {
					yield new Uint8Array([i, i + 1, i + 2]);
				}
			})(),
		);

		const server = new WebSocketServer(headerData, mockStream);

		try {
			// Start the server
			server.listen(port);

			// Give the server a moment to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Act & Assert
			await new Promise<void>((resolve, reject) => {
				const client = new WebSocket(`ws://localhost:${port}`);
				const messageTimestamps: number[] = [];
				let messageCount = 0;

				client.on("message", () => {
					messageCount++;
					messageTimestamps.push(Date.now());

					// Skip the first message (header) and collect timing for stream messages
					if (messageCount > 1 && messageCount <= 6) {
						// Collect 5 stream messages
						if (messageCount === 6) {
							// Analyze timing after receiving enough messages
							try {
								const streamTimestamps = messageTimestamps.slice(1); // Remove header timestamp
								const intervals: number[] = [];

								for (let i = 1; i < streamTimestamps.length; i++) {
									intervals.push(streamTimestamps[i] - streamTimestamps[i - 1]);
								}

								// Verify intervals are close to expected (10ms ± 5ms tolerance)
								for (const interval of intervals) {
									assert.ok(
										Math.abs(interval - expectedInterval) <= tolerance,
										`Interval ${interval}ms is not within tolerance of ${expectedInterval}ms ± ${tolerance}ms`,
									);
								}

								client.close();
								resolve();
							} catch (error) {
								client.close();
								reject(error);
							}
						}
					}
				});

				client.on("error", (error) => {
					reject(error);
				});

				client.on("close", () => {
					if (messageCount < 6) {
						reject(
							new Error(
								`Expected at least 6 messages but received ${messageCount}`,
							),
						);
					}
				});

				// Set a timeout to avoid hanging
				setTimeout(() => {
					if (messageCount < 6) {
						client.close();
						reject(
							new Error("Timeout waiting for messages to measure frequency"),
						);
					}
				}, 3000);
			});
		} finally {
			// Cleanup
			server.close();
		}
	});

	test("should send header first to each connection when multiple clients connect", async () => {
		// Arrange
		const port = 8084;
		const headerData = new Uint8Array([1, 2, 3, 4, 5]);
		const updateData1 = new Uint8Array([10, 20, 30]);

		// Create a mock stream that yields one update
		const mockStream = new GenericObservable<Uint8Array<ArrayBufferLike>>(() =>
			(function* () {
				yield updateData1;
			})(),
		);

		const server = new WebSocketServer(headerData, mockStream);

		try {
			// Start the server
			server.listen(port);

			// Give the server a moment to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Test multiple clients sequentially to avoid timing issues

			// Test Client 1 - connects first
			await new Promise<void>((resolve, reject) => {
				const client1 = new WebSocket(`ws://localhost:${port}`);
				let messageCount = 0;
				const timeout = setTimeout(() => {
					client1.close();
					reject(new Error("Client 1 timeout"));
				}, 2000);

				client1.on("message", (data) => {
					try {
						messageCount++;
						const receivedData = new Uint8Array(data as Buffer);

						if (messageCount === 1) {
							// First message should be header data
							assert.deepStrictEqual(receivedData, headerData);
						} else if (messageCount === 2) {
							// Second message should be update data
							assert.deepStrictEqual(receivedData, updateData1);
							clearTimeout(timeout);
							client1.close();
							resolve();
						}
					} catch (error) {
						clearTimeout(timeout);
						client1.close();
						reject(error);
					}
				});

				client1.on("error", (error) => {
					clearTimeout(timeout);
					reject(error);
				});
			});

			// Small delay before testing second client
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Test Client 2 - connects after stream is already active
			await new Promise<void>((resolve, reject) => {
				const client2 = new WebSocket(`ws://localhost:${port}`);
				let messageCount = 0;
				const timeout = setTimeout(() => {
					client2.close();
					reject(new Error("Client 2 timeout"));
				}, 2000);

				client2.on("message", (data) => {
					try {
						messageCount++;
						const receivedData = new Uint8Array(data as Buffer);

						if (messageCount === 1) {
							// First message should always be header data, even for late-joining client
							assert.deepStrictEqual(receivedData, headerData);
							clearTimeout(timeout);
							client2.close();
							resolve();
						}
					} catch (error) {
						clearTimeout(timeout);
						client2.close();
						reject(error);
					}
				});

				client2.on("error", (error) => {
					clearTimeout(timeout);
					reject(error);
				});
			});
		} finally {
			// Cleanup
			server.close();
		}
	});
});
