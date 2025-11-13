import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { GenericObservable } from "../src/generic-observable";

describe("GenericObservable", () => {
	test("should instantiate with a generator function", () => {
		const generatorFn = function* () {
			yield 1;
			yield 2;
			yield 3;
		};

		const observable = new GenericObservable(generatorFn);
		assert.ok(observable);
		assert.ok(observable instanceof GenericObservable);
	});

	test("should call callback with values from generator", (_t, done) => {
		const expectedValues = [1, 2, 3];
		const receivedValues: number[] = [];

		const generatorFn = function* () {
			yield 1;
			yield 2;
			yield 3;
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe((value) => {
			receivedValues.push(value);

			if (receivedValues.length === expectedValues.length) {
				unsubscribe();
				assert.deepStrictEqual(receivedValues, expectedValues);
				done();
			}
		});
	});

	test("should work with different data types - strings", (_t, done) => {
		const expectedValues = ["hello", "world", "test"];
		const receivedValues: string[] = [];

		const generatorFn = function* () {
			yield "hello";
			yield "world";
			yield "test";
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe((value) => {
			receivedValues.push(value);

			if (receivedValues.length === expectedValues.length) {
				unsubscribe();
				assert.deepStrictEqual(receivedValues, expectedValues);
				done();
			}
		});
	});

	test("should work with complex objects", (_t, done) => {
		const expectedValues = [
			{ id: 1, name: "John" },
			{ id: 2, name: "Jane" },
			{ id: 3, name: "Bob" },
		];
		const receivedValues: Array<{ id: number; name: string }> = [];

		const generatorFn = function* () {
			yield { id: 1, name: "John" };
			yield { id: 2, name: "Jane" };
			yield { id: 3, name: "Bob" };
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe((value) => {
			receivedValues.push(value);

			if (receivedValues.length === expectedValues.length) {
				unsubscribe();
				assert.deepStrictEqual(receivedValues, expectedValues);
				done();
			}
		});
	});

	test("should handle empty generator", (_t, done) => {
		const generatorFn = function* (): Generator<number> {
			// Empty generator - no yields
		};

		const observable = new GenericObservable(generatorFn);

		// Set a timeout to ensure no values are emitted
		const timeout = setTimeout(() => {
			done();
		}, 50); // Wait 50ms to ensure no callbacks occur

		observable.subscribe((_value) => {
			clearTimeout(timeout);
			assert.fail("Should not receive any values from empty generator");
		});
	});

	test("should handle single value generator", (_t, done) => {
		const expectedValue = 42;
		let callCount = 0;

		const generatorFn = function* () {
			yield 42;
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe((value) => {
			callCount++;
			assert.strictEqual(value, expectedValue);

			// Give it some time to ensure no more calls happen
			setTimeout(() => {
				unsubscribe();
				assert.strictEqual(callCount, 1);
				done();
			}, 50);
		});
	});

	test("should return unsubscribe function that stops the stream", (_t, done) => {
		let callCount = 0;

		const generatorFn = function* () {
			for (let i = 1; i <= 10; i++) {
				yield i;
			}
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe((_value) => {
			callCount++;

			if (callCount === 2) {
				unsubscribe(); // Stop after 2 values

				// Wait to ensure no more calls happen after unsubscribe
				setTimeout(() => {
					assert.strictEqual(callCount, 2);
					done();
				}, 50);
			}
		});
	});

	test("should support multiple subscribers to the same observable", (_t, done) => {
		const expectedValues = [1, 2, 3];
		const receivedValues1: number[] = [];
		const receivedValues2: number[] = [];
		let completedSubscribers = 0;

		const generatorFn = function* () {
			yield 1;
			yield 2;
			yield 3;
		};

		// Note: Each observable instance has its own generator instance
		// So we create separate observables for multiple subscribers
		const observable1 = new GenericObservable(generatorFn);
		const observable2 = new GenericObservable(generatorFn);

		const checkCompletion = () => {
			completedSubscribers++;
			if (completedSubscribers === 2) {
				assert.deepStrictEqual(receivedValues1, expectedValues);
				assert.deepStrictEqual(receivedValues2, expectedValues);
				done();
			}
		};

		const unsubscribe1 = observable1.subscribe((value) => {
			receivedValues1.push(value);
			if (receivedValues1.length === expectedValues.length) {
				unsubscribe1();
				checkCompletion();
			}
		});

		const unsubscribe2 = observable2.subscribe((value) => {
			receivedValues2.push(value);
			if (receivedValues2.length === expectedValues.length) {
				unsubscribe2();
				checkCompletion();
			}
		});
	});

	test("should handle generator that throws an error", () => {
		const generatorFn = function* () {
			yield 1;
			throw new Error("Generator error");
		};

		// Test that creating the observable doesn't throw
		const observable = new GenericObservable(generatorFn);
		assert.ok(observable);

		// Test that subscribing doesn't throw immediately
		assert.doesNotThrow(() => {
			const unsubscribe = observable.subscribe(() => {
				// Callback implementation
			});
			// Clean up immediately to avoid async issues
			unsubscribe();
		});
	});

	test("should handle infinite generator with unsubscribe", (_t, done) => {
		let callCount = 0;
		const maxCalls = 5;

		const generatorFn = function* () {
			let i = 0;
			while (true) {
				yield i++;
			}
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe((value) => {
			callCount++;
			assert.strictEqual(value, callCount - 1);

			if (callCount === maxCalls) {
				unsubscribe();

				// Wait to ensure no more calls after unsubscribe
				setTimeout(() => {
					assert.strictEqual(callCount, maxCalls);
					done();
				}, 50);
			}
		});
	});

	test("should respect the frequency - approximately 100 Hz", (_t, done) => {
		const timestamps: number[] = [];

		const generatorFn = function* () {
			yield 1;
			yield 2;
			yield 3;
			yield 4;
			yield 5;
		};

		const observable = new GenericObservable(generatorFn);
		const unsubscribe = observable.subscribe(() => {
			timestamps.push(Date.now());

			if (timestamps.length === 5) {
				unsubscribe();

				// Check intervals between timestamps
				for (let i = 1; i < timestamps.length; i++) {
					const interval = timestamps[i] - timestamps[i - 1];
					// Should be approximately 10ms (1000/100 Hz) with some tolerance
					assert.ok(
						interval >= 5 && interval <= 20,
						`Interval ${interval}ms should be around 10ms`,
					);
				}
				done();
			}
		});
	});
});
