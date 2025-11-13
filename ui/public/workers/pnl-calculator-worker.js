class PnLCalculatorWorker {
	constructor() {
		this.headerData = null; // Stored once, order never changes
		this.positions = []; // Array of [quantity, entryPrice]
	}

	setHeaderData(headerData) {
		this.headerData = headerData;
	}

	setPositions(positions) {
		this.positions = positions;
	}

	calculatePnL(rawData, timestamp) {
		if (!this.headerData || !rawData) {
			return rawData;
		}

		const lossesData = []; // For losses (negative PnL %), biggest losses first
		const profitsData = []; // For profits (positive PnL %), biggest profits first
		let totalPnlAmount = 0;
		let totalInvestedAmount = 0;
		let positiveCount = 0;
		let negativeCount = 0;

		// Process data in chunks of 7: [symbolIndex, last, change, changePercentage, high, low, volume]
		for (let i = 0; i < rawData.length; i += 7) {
			const symbolIndex = rawData[i];

			// Use symbol from header to get position from Map
			const position = this.positions[symbolIndex];
			if (!position) continue; // Only process stocks where we have positions

			const [quantity, entryPrice] = position;

			const last = rawData[i + 1];
			const change = rawData[i + 2];
			const changePercentage = rawData[i + 3];
			const high = rawData[i + 4];
			const low = rawData[i + 5];
			const volume = rawData[i + 6];

			const currentPrice = last;
			const unrealizedPL = (currentPrice - entryPrice) * quantity;
			const unrealizedPLPercentage =
				entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

			// Accumulate totals for aggregates
			totalPnlAmount += unrealizedPL;
			totalInvestedAmount += entryPrice * quantity;

			// Count positive and negative positions
			if (unrealizedPL > 0) {
				positiveCount++;
			} else if (unrealizedPL < 0) {
				negativeCount++;
			}

			// Create the data chunk for this stock using original symbolIndex
			// [symbolIndex, last, change, changePercentage, high, low, volume, unrealizedPL, unrealizedPLPercentage]
			const stockData = [
				symbolIndex, // Use original symbol index, not filtered
				last,
				change,
				changePercentage,
				high,
				low,
				volume,
				unrealizedPL,
				unrealizedPLPercentage,
			];

			// Insert in the right index based on P&L %
			if (unrealizedPLPercentage < 0) {
				// It's a loss - insert into losses array (biggest losses first)
				this._insertSorted(lossesData, stockData, unrealizedPLPercentage, true);
			} else {
				// It's a profit (or break-even) - insert into profits array (biggest profits first)
				this._insertSorted(
					profitsData,
					stockData,
					unrealizedPLPercentage,
					false,
				);
			}
		}

		// Combine losses and profits arrays (losses first, then profits)
		const enhancedData = [...lossesData, ...profitsData];

		// Calculate total P&L percentage
		const totalPnlPercentage =
			totalInvestedAmount > 0
				? (totalPnlAmount / totalInvestedAmount) * 100
				: 0;

		return {
			data: enhancedData,
			timestamp,
			aggregates: {
				pnlAmount: totalPnlAmount,
				pnlPercentage: totalPnlPercentage,
				pCount: positiveCount,
				lCount: negativeCount,
			},
		};
	}

	_insertSorted(array, stockData, pnlPercentage, isLoss) {
		let insertIndex = 0;

		for (let j = 0; j < array.length; j += 9) {
			const existingPLPercentage = array[j + 8]; // PnL percentage is at index 8

			if (isLoss) {
				// For losses: biggest losses first (most negative first)
				if (pnlPercentage < existingPLPercentage) {
					break;
				}
			} else {
				// For profits: biggest profits first (most positive first)
				if (pnlPercentage > existingPLPercentage) {
					break;
				}
			}
			insertIndex = j + 9;
		}

		array.splice(insertIndex, 0, ...stockData);
	}

	handleMessage(event) {
		const { type, data } = event.data;

		switch (type) {
			case "set-positions":
				this.setPositions(data.positions);
				break;

			case "set-header":
				this.setHeaderData(data.headerData);
				break;

			case "calculate-pnl":
				self.postMessage({
					type: "pnl-calculated",
					data: this.calculatePnL(data.rawData, data.timestamp),
				});
				break;

			case "ping":
				self.postMessage({ type: "pong" });
				break;
		}
	}
}

// Create worker instance
const worker = new PnLCalculatorWorker();

// Handle messages from main thread
self.addEventListener("message", (event) => {
	worker.handleMessage(event);
});

self.postMessage({ type: "worker-ready" });
