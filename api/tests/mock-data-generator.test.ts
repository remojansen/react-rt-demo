import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { FastMockUpdatesGenerator } from "../src/mock-data-generator";

describe("FastMockUpdatesGenerator", () => {
	test("getPositions - should return valid position data", () => {
		const generator = new FastMockUpdatesGenerator();
		const positions = generator.getPositions();

		// Check structure
		assert.ok(positions.symbols);
		assert.ok(positions.names);

		// Check types
		assert.ok(Array.isArray(positions.symbols));
		assert.ok(Array.isArray(positions.names));

		// Check that arrays have matching lengths
		assert.strictEqual(positions.symbols.length, positions.names.length);

		// Should have data (assuming S&P data is loaded)
		assert.ok(positions.symbols.length > 0);

		// Check that all symbols are non-empty strings
		positions.symbols.forEach((symbol) => {
			assert.strictEqual(typeof symbol, "string");
			assert.ok(symbol.length > 0);
		});

		// Check that all names are non-empty strings
		positions.names.forEach((name) => {
			assert.strictEqual(typeof name, "string");
			assert.ok(name.length > 0);
		});
	});

	test("getUpdatedStocks - should return valid updated stock data", () => {
		const generator = new FastMockUpdatesGenerator();

		// Trigger some updates first
		generator.batchUpdate();

		const updatedStocks = generator.getUpdatedStocks();

		// Should return a Float32Array
		assert.ok(updatedStocks instanceof Float32Array);

		// Length should be divisible by 7 (each stock has 7 fields)
		assert.strictEqual(updatedStocks.length % 7, 0);

		const numberOfUpdatedStocks = updatedStocks.length / 7;

		// Get positions for validation
		const positions = generator.getPositions();

		// If there are updates, validate the structure
		for (let i = 0; i < numberOfUpdatedStocks; i++) {
			const baseIndex = i * 7;
			const stockIndex = updatedStocks[baseIndex];
			const last = updatedStocks[baseIndex + 1];
			const change = updatedStocks[baseIndex + 2];
			const changePercentage = updatedStocks[baseIndex + 3];
			const high = updatedStocks[baseIndex + 4];
			const low = updatedStocks[baseIndex + 5];
			const volume = updatedStocks[baseIndex + 6];

			// Validate stock index is a non-negative integer within bounds
			assert.ok(Number.isInteger(stockIndex));
			assert.ok(stockIndex >= 0);
			assert.ok(stockIndex < positions.symbols.length);

			// Validate all price fields are finite numbers
			assert.ok(Number.isFinite(last));
			assert.ok(Number.isFinite(change));
			assert.ok(Number.isFinite(changePercentage));
			assert.ok(Number.isFinite(high));
			assert.ok(Number.isFinite(low));
			assert.ok(Number.isFinite(volume));

			// Validate business logic constraints
			assert.ok(last > 0, "Last price should be positive");
			assert.ok(high >= last, "High should be >= current price");
			assert.ok(low <= last, "Low should be <= current price");
			assert.ok(volume >= 0, "Volume should be non-negative");
			assert.ok(Number.isInteger(volume), "Volume should be integer");
		}

		// Test that multiple calls work consistently
		const updatedStocks2 = generator.getUpdatedStocks();
		assert.ok(updatedStocks2 instanceof Float32Array);
		assert.strictEqual(updatedStocks2.length % 7, 0);

		// After another batch update, we should get potentially different results
		generator.batchUpdate();
		const updatedStocks3 = generator.getUpdatedStocks();
		assert.ok(updatedStocks3 instanceof Float32Array);
		assert.strictEqual(updatedStocks3.length % 7, 0);
	});
});
