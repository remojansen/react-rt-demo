class PnLCalculatorWorker {
	constructor() {
		this.headerData = null;
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

		let totalPnlAmountBigInt = 0n;
		let totalInvestedAmountBigInt = 0n;
		let positiveCount = 0;
		let negativeCount = 0;

		// Process data in chunks of 7:
		// [symbolIndex, last, change, changePercentage, high, low, volume]
		for (let i = 0; i < rawData.length; i += 7) {
			const symbolIndex = rawData[i];

			// Use index from header to get position from Map
			const position = this.positions[symbolIndex];

			// Only process stocks where we have positions
			if (!position) continue;

			const [quantity, entryPrice] = position;

			const last = rawData[i + 1];
			const change = rawData[i + 2];
			const changePercentage = rawData[i + 3];
			const high = rawData[i + 4];
			const low = rawData[i + 5];
			const volume = rawData[i + 6];
			const currentPrice = last;

			// Multiply by 10000 to preserve 4 decimal places, then convert to BigInt
			const currentPriceBigInt = BigInt(Math.round(currentPrice * 10000));
			const entryPriceBigInt = BigInt(Math.round(entryPrice * 10000));
			const quantityBigInt = BigInt(Math.round(quantity));

			const priceDiffBigInt = currentPriceBigInt - entryPriceBigInt;
			const unrealizedPLBigInt = (priceDiffBigInt * quantityBigInt) / 10000n;
			const investedAmountBigInt = (entryPriceBigInt * quantityBigInt) / 10000n;
			const unrealizedPL = Number(unrealizedPLBigInt);

			const unrealizedPLPercentage =
				entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

			totalPnlAmountBigInt += unrealizedPLBigInt;
			totalInvestedAmountBigInt += investedAmountBigInt;

			if (unrealizedPL > 0) {
				positiveCount++;
			} else if (unrealizedPL < 0) {
				negativeCount++;
			}

			const stockData = [
				symbolIndex,
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

		const totalPnlAmount = Number(totalPnlAmountBigInt);
		const totalInvestedAmount = Number(totalInvestedAmountBigInt);

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

const worker = new PnLCalculatorWorker();

self.addEventListener("message", (event) => {
	worker.handleMessage(event);
});

self.postMessage({ type: "worker-ready" });
