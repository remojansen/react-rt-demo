import data from "../data/s&p-500.json";

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

const DATA_LENGTH = data.length;
const BASE_AMPLITUDE_PERCENTAGE = 0.02; // Base 2% amplitude
const BASE_FREQUENCY = 0.001; // Base frequency for sine wave

// Array index constants
const FIELDS_PER_STOCK = 6;
const LAST_PRICE_INDEX = 0;
const CHANGE_INDEX = 1;
const CHANGE_PERCENTAGE_INDEX = 2;
const HIGH_INDEX = 3;
const LOW_INDEX = 4;
const VOLUME_INDEX = 5;

// Simple hash function for stock symbols
function hashSymbol(symbol: string): number {
	let hash = 0;
	for (let i = 0; i < symbol.length; i++) {
		const char = symbol.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return hash;
}

// Get frequency multiplier based on hash (0.5x to 2.5x base frequency)
function getStockFrequency(symbol: string): number {
	const hash = Math.abs(hashSymbol(symbol));
	return 0.5 + (hash % 201) / 100; // Range: 0.5 to 2.5
}

// Get amplitude multiplier based on hash (0.3x to 1.8x base amplitude)
function getStockAmplitude(symbol: string): number {
	const hash = Math.abs(hashSymbol(symbol));
	return 0.3 + ((hash >> 8) % 151) / 100; // Range: 0.3 to 1.8
}

// Get phase offset based on hash (0 to 2π)
function getStockPhaseOffset(symbol: string): number {
	const hash = Math.abs(hashSymbol(symbol));
	return (((hash >> 16) % 1000) / 1000) * 2 * Math.PI;
}

// Get initial time offset based on hash - use multiple hash bits for better distribution
function getStockTimeOffset(symbol: string): number {
	const hash = Math.abs(hashSymbol(symbol));
	// Combine different parts of the hash for better distribution
	const offset1 = (hash & 0xff) * 47; // Use lower 8 bits
	const offset2 = ((hash >> 8) & 0xff) * 73; // Use next 8 bits
	const offset3 = ((hash >> 16) & 0xff) * 31; // Use next 8 bits
	return (offset1 + offset2 + offset3) % 100000; // Much larger range for more variation
}

export class FastMockUpdatesGenerator {
	private _data: Float32Array;
	private _updateQueue: Uint32Array;
	private _symbols: string[];
	private _names: string[];
	private _stockFrequencies: Float32Array; // Frequency multiplier for each stock
	private _stockAmplitudes: Float32Array; // Amplitude multiplier for each stock
	private _stockPhases: Float32Array; // Phase offset for each stock
	private _stockTimeOffsets: Float32Array; // Individual time offsets for each stock
	private _queueSize = 0;
	private _stockData: TradingData[];
	private _sessionHighs: Float32Array; // Track highs since app start
	private _sessionLows: Float32Array; // Track lows since app start
	private _originalPrices: Float32Array; // Store original prices for change calculation
	private _timeStep = 0; // Time counter for sine wave

	public constructor() {
		this._data = new Float32Array(DATA_LENGTH * FIELDS_PER_STOCK);
		this._updateQueue = new Uint32Array(DATA_LENGTH);
		this._symbols = new Array(DATA_LENGTH);
		this._names = new Array(DATA_LENGTH);
		this._stockFrequencies = new Float32Array(DATA_LENGTH);
		this._stockAmplitudes = new Float32Array(DATA_LENGTH);
		this._stockPhases = new Float32Array(DATA_LENGTH);
		this._stockTimeOffsets = new Float32Array(DATA_LENGTH);
		this._stockData = [];
		this._sessionHighs = new Float32Array(DATA_LENGTH);
		this._sessionLows = new Float32Array(DATA_LENGTH);
		this._originalPrices = new Float32Array(DATA_LENGTH);

		// Initialize data
		for (let i = 0; i < DATA_LENGTH; i++) {
			const stock = data[i];
			const baseIdx = i * FIELDS_PER_STOCK;

			// Calculate hash-based parameters for sine wave
			this._stockFrequencies[i] = getStockFrequency(stock.symbol);
			this._stockAmplitudes[i] = getStockAmplitude(stock.symbol);
			this._stockPhases[i] = getStockPhaseOffset(stock.symbol);
			this._stockTimeOffsets[i] = getStockTimeOffset(stock.symbol);

			// Calculate initial price with sine wave offset
			const frequency = this._stockFrequencies[i] * BASE_FREQUENCY;
			const amplitude = this._stockAmplitudes[i] * BASE_AMPLITUDE_PERCENTAGE;
			const phase = this._stockPhases[i];
			const timeOffset = this._stockTimeOffsets[i];

			const sineValue = Math.sin(timeOffset * frequency + phase);
			const initialPriceChangePercentage = sineValue * amplitude;
			const initialPrice = Math.max(
				0.01,
				stock.last * (1 + initialPriceChangePercentage),
			);

			this._data[baseIdx + LAST_PRICE_INDEX] = initialPrice;
			this._data[baseIdx + CHANGE_INDEX] = initialPrice - stock.last;
			this._data[baseIdx + CHANGE_PERCENTAGE_INDEX] =
				stock.last > 0 ? ((initialPrice - stock.last) / stock.last) * 100 : 0;
			this._data[baseIdx + HIGH_INDEX] = Math.max(stock.high, initialPrice);
			this._data[baseIdx + LOW_INDEX] = Math.min(stock.low, initialPrice);
			this._data[baseIdx + VOLUME_INDEX] = stock.volume;

			this._symbols[i] = stock.symbol;
			this._names[i] = stock.name;

			// Initialize session highs/lows with initial calculated price
			this._sessionHighs[i] = Math.max(stock.high, initialPrice);
			this._sessionLows[i] = Math.min(stock.low, initialPrice);
			this._originalPrices[i] = stock.last; // Store original price

			// Update stock data with initial calculated values
			this._stockData[i] = {
				...stock,
				last: initialPrice,
				change: initialPrice - stock.last,
				changePercentage:
					stock.last > 0 ? ((initialPrice - stock.last) / stock.last) * 100 : 0,
				high: Math.max(stock.high, initialPrice),
				low: Math.min(stock.low, initialPrice),
			};
		}
	}

	public batchUpdate(): void {
		this._queueSize = 0;
		this._timeStep++; // Increment time for sine wave

		// Update all stocks every time (simplified)
		for (let i = 0; i < DATA_LENGTH; i++) {
			const baseIdx = i * FIELDS_PER_STOCK;
			const originalPrice = this._originalPrices[i];

			// Calculate sine wave value for this stock using individual time offset
			const frequency = this._stockFrequencies[i] * BASE_FREQUENCY;
			const amplitude = this._stockAmplitudes[i] * BASE_AMPLITUDE_PERCENTAGE;
			const phase = this._stockPhases[i];
			const timeOffset = this._stockTimeOffsets[i];

			const sineValue = Math.sin(
				(this._timeStep + timeOffset) * frequency + phase,
			);

			// Apply sine wave to price (oscillating around original price)
			const priceChangePercentage = sineValue * amplitude;
			const newPrice = Math.max(
				0.01,
				originalPrice * (1 + priceChangePercentage),
			);

			// Calculate change from original price
			const totalPriceChange = newPrice - originalPrice;
			const changePercentage =
				originalPrice > 0 ? (totalPriceChange / originalPrice) * 100 : 0;

			// Update session highs and lows
			if (newPrice > this._sessionHighs[i]) {
				this._sessionHighs[i] = newPrice;
			}
			if (newPrice < this._sessionLows[i]) {
				this._sessionLows[i] = newPrice;
			}

			this._data[baseIdx + LAST_PRICE_INDEX] = newPrice;
			this._data[baseIdx + CHANGE_INDEX] = totalPriceChange;
			this._data[baseIdx + CHANGE_PERCENTAGE_INDEX] = changePercentage;
			this._data[baseIdx + HIGH_INDEX] = this._sessionHighs[i];
			this._data[baseIdx + LOW_INDEX] = this._sessionLows[i];
			// Volume stays the same (no random changes)

			this._stockData[i].last = newPrice;
			this._stockData[i].change = totalPriceChange;
			this._stockData[i].changePercentage = changePercentage;
			this._stockData[i].high = this._sessionHighs[i];
			this._stockData[i].low = this._sessionLows[i];

			this._updateQueue[this._queueSize++] = i;
		}
	}

	public getUpdatedStocks(): Float32Array {
		const updated = new Float32Array(this._queueSize * 7);
		let arrayIndex = 0;

		for (let i = 0; i < this._queueSize; i++) {
			const stockIndex = this._updateQueue[i];
			const baseIdx = stockIndex * FIELDS_PER_STOCK;

			updated[arrayIndex++] = stockIndex;
			updated[arrayIndex++] = this._data[baseIdx + LAST_PRICE_INDEX];
			updated[arrayIndex++] = this._data[baseIdx + CHANGE_INDEX];
			updated[arrayIndex++] = this._data[baseIdx + CHANGE_PERCENTAGE_INDEX];
			updated[arrayIndex++] = this._data[baseIdx + HIGH_INDEX];
			updated[arrayIndex++] = this._data[baseIdx + LOW_INDEX];
			updated[arrayIndex++] = this._data[baseIdx + VOLUME_INDEX];
		}

		return updated;
	}

	public getPositions() {
		return {
			symbols: this._symbols,
			names: this._names,
		};
	}

	// Debug method to see stock sine wave parameters
	public getStockInfo(stockIndex: number):
		| {
				frequency: number;
				amplitude: number;
				phase: number;
				timeOffset: number;
				symbol: string;
		  }
		| undefined {
		if (stockIndex >= 0 && stockIndex < this._symbols.length) {
			return {
				frequency: this._stockFrequencies[stockIndex],
				amplitude: this._stockAmplitudes[stockIndex],
				phase: this._stockPhases[stockIndex],
				timeOffset: this._stockTimeOffsets[stockIndex],
				symbol: this._symbols[stockIndex],
			};
		}
		return undefined;
	}
}
