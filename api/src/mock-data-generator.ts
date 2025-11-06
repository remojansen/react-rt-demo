import data from "../data/s&p.json";

export interface TradingData {
	symbol: string;
	name: string;
	last: number;
	change: number | null;
	changePercentage: number | null;
	high: number;
	low: number;
	volume: number;
}

// Pre-compute constants for performance
const DATA_LENGTH = data.length;
const PRICE_VOLATILITY = 0.02; // 2% max change per update
const VOLUME_VOLATILITY = 0.1; // 10% max volume change
const MAX_VOLUME = Math.min(...data.map((stock) => stock.volume));
const BASE_UPDATE_PROBABILITY = 0.3; // 30% base chance for any stock to update

// Array index constants for better maintainability
const FIELDS_PER_STOCK = 6;
const LAST_PRICE_INDEX = 0;
const CHANGE_INDEX = 1;
const CHANGE_PERCENTAGE_INDEX = 2;
const HIGH_INDEX = 3;
const LOW_INDEX = 4;
const VOLUME_INDEX = 5;

// Fast random number generator using XORShift (much faster than Math.random)
const fastRandom = (() => {
	let seed = Date.now() % 2147483647;
	return () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};
})();

function shouldUpdate(originalVolume: number): boolean {
	// Use original volume for probability calculation to maintain consistent update rates
	const volumeBasedChance = (originalVolume * 50) / MAX_VOLUME; // Reduced from 100 to 50
	const totalChance = Math.min(
		BASE_UPDATE_PROBABILITY * 100 + volumeBasedChance,
		80
	); // Cap at 80%
	return fastRandom() * 100 < totalChance;
}

// High-performance data structures for real-time mock updates
export class FastMockUpdatesGenerator {
	private data: Float32Array;
	private indices: Uint32Array;
	private updateQueue: Uint32Array;
	private symbols: string[];
	private names: string[];
	private originalVolumes: Float32Array; // Store original volumes
	private queueSize = 0;
	private stockData: TradingData[];

	public constructor() {
		// Each position: [last, change, changePercentage, high, low, volume]
		this.data = new Float32Array(DATA_LENGTH * FIELDS_PER_STOCK);
		this.indices = new Uint32Array(DATA_LENGTH);
		this.updateQueue = new Uint32Array(DATA_LENGTH);
		this.symbols = new Array(DATA_LENGTH);
		this.names = new Array(DATA_LENGTH);
		this.originalVolumes = new Float32Array(DATA_LENGTH); // Add this
		this.stockData = [];
		const maxCount = Math.min(DATA_LENGTH, this.symbols.length);

		let i = maxCount;
		while (i--) {
			const stockIndex = i % DATA_LENGTH; // Wrap around if size > DATA_LENGTH
			const stock = data[stockIndex];
			const baseIdx = i * FIELDS_PER_STOCK;

			this.data[baseIdx + VOLUME_INDEX] = stock.volume;
			this.data[baseIdx + LAST_PRICE_INDEX] = stock.last;
			this.data[baseIdx + CHANGE_INDEX] = stock.change ?? 0;
			this.data[baseIdx + CHANGE_PERCENTAGE_INDEX] =
				stock.changePercentage ?? 0;
			this.data[baseIdx + HIGH_INDEX] = stock.high;
			this.data[baseIdx + LOW_INDEX] = stock.low;
			this.data[baseIdx + VOLUME_INDEX] = stock.volume;

			this.symbols[i] = stock.symbol;
			this.names[i] = stock.name;
			this.indices[i] = i;
			this.originalVolumes[i] = stock.volume; // Store original volume

			// Store complete stock data for reference with null handling
			this.stockData[i] = stock;
		}
	}

	public batchUpdate(): void {
		this.queueSize = 0;
		this.updateQueue.fill(0);
		const maxCount = Math.min(DATA_LENGTH, this.symbols.length);

		let i = maxCount;
		while (i--) {
			const baseIdx = i * FIELDS_PER_STOCK;
			const currentVolume = this.data[baseIdx + VOLUME_INDEX];
			const originalVolume = this.originalVolumes[i];

			if (shouldUpdate(originalVolume)) {
				const currentPrice = this.data[baseIdx + LAST_PRICE_INDEX];
				const currentHigh = this.data[baseIdx + HIGH_INDEX];
				const currentLow = this.data[baseIdx + LOW_INDEX];

				const priceRandom = (fastRandom() - 0.5) * PRICE_VOLATILITY;
				const volumeRandom = (fastRandom() - 0.5) * VOLUME_VOLATILITY;

				const newPrice = currentPrice * (1 + priceRandom);
				const priceChange = newPrice - currentPrice;
				const newVolume = Math.max(0, currentVolume * (1 + volumeRandom));

				const changePercentage =
					currentPrice > 0 ? (priceChange / currentPrice) * 100 : 0;

				this.data[baseIdx + LAST_PRICE_INDEX] = newPrice;
				this.data[baseIdx + CHANGE_INDEX] = priceChange;
				this.data[baseIdx + CHANGE_PERCENTAGE_INDEX] = changePercentage;
				this.data[baseIdx + HIGH_INDEX] = Math.max(currentHigh, newPrice);
				this.data[baseIdx + LOW_INDEX] = Math.min(currentLow, newPrice);
				this.data[baseIdx + VOLUME_INDEX] = newVolume;

				this.stockData[i].last = newPrice;
				this.stockData[i].change = priceChange;
				this.stockData[i].changePercentage = changePercentage;
				this.stockData[i].high = Math.max(currentHigh, newPrice);
				this.stockData[i].low = Math.min(currentLow, newPrice);
				this.stockData[i].volume = Math.floor(newVolume);

				this.updateQueue[this.queueSize++] = i;
			}
		}
	}

	// Get stocks that were updated in the last batch - optimized for protobuf
	public getUpdatedStocks(): number[] {
		const updated = new Array(this.queueSize * 7);
		let arrayIndex = 0;

		for (let i = 0; i < this.queueSize; i++) {
			const stockIndex = this.updateQueue[i];
			const baseIdx = stockIndex * FIELDS_PER_STOCK;

			// Pack 7 values per stock: [stockIndex, last, change, changePercentage, high, low, volume]
			updated[arrayIndex++] = stockIndex; // Use for symbol/name lookup
			updated[arrayIndex++] = this.data[baseIdx + LAST_PRICE_INDEX];
			updated[arrayIndex++] = this.data[baseIdx + CHANGE_INDEX];
			updated[arrayIndex++] = this.data[baseIdx + CHANGE_PERCENTAGE_INDEX];
			updated[arrayIndex++] = this.data[baseIdx + HIGH_INDEX];
			updated[arrayIndex++] = this.data[baseIdx + LOW_INDEX];
			updated[arrayIndex++] = Math.floor(this.data[baseIdx + VOLUME_INDEX]);
		}

		return updated;
	}

	// Separate methods for symbol/name lookup (send these once, not on every update)
	public getSymbolsAndNames(): { symbols: string[]; names: string[] } {
		return {
			symbols: [...this.symbols],
			names: [...this.names],
		};
	}
}
