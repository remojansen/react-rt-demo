export class GenericObservable<T> {
	private _generator: Generator<T, void, unknown>;

	constructor(generatorFn: () => Generator<T>) {
		this._generator = generatorFn();
	}

	subscribe(callback: (value: T) => void): () => void {
		// Fake data stream at specified frequency
		const MHZ = 100;
		const intervalId = setInterval(() => {
			const { value, done } = this._generator.next();
			if (done) {
				clearInterval(intervalId);
			} else {
				callback(value);
			}
		}, 1000 / MHZ);
		return () => clearInterval(intervalId);
	}
}
