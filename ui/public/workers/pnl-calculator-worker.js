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

		const lossesData = []; // Array of arrays for losses (negative PnL %)
		const profitsData = []; // Array of arrays for profits (positive PnL %)

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

			// Add to appropriate array without sorting
			if (unrealizedPLPercentage < 0) {
				// It's a loss
				lossesData.push(stockData);
			} else {
				// It's a profit (or break-even)
				profitsData.push(stockData);
			}
		}

		// Sort losses: biggest losses first (most negative first)
		lossesData.sort((a, b) => a[8] - b[8]); // a[8] is unrealizedPLPercentage

		// Sort profits: biggest profits first (most positive first)
		profitsData.sort((a, b) => b[8] - a[8]); // b[8] is unrealizedPLPercentage

		// Combine and flatten arrays (losses first, then profits)
		const enhancedData = lossesData.concat(profitsData).flat();

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
