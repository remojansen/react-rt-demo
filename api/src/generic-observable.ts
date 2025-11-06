export class GenericObservable<T> {
	private _generator: Generator<T, void, unknown>;
	public headerData: Uint8Array<ArrayBufferLike>;

	constructor(
		headerData: Uint8Array<ArrayBufferLike>,
		generatorFn: () => Generator<T>,
	) {
		this._generator = generatorFn();
		this.headerData = headerData;
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
