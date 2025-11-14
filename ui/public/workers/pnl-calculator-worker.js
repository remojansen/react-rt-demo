class PnLCalculatorWorker {
	constructor() {
		this.headerData = null;
		this.positions = [];
		this.PRECISION_FACTOR = 1000000n; // Use 6 decimal places for better precision
	}

	// Convert a floating-point number to BigInt with precision preservation
	toBigIntPrecise(value) {
		// Handle potential floating-point precision issues by using string conversion
		const str = value.toString();
		const [integer, decimal = ""] = str.split(".");
		const paddedDecimal = decimal.padEnd(6, "0").slice(0, 6); // 6 decimal places
		return BigInt(integer + paddedDecimal);
	}

	// Convert BigInt back to floating-point number
	fromBigIntPrecise(bigIntValue) {
		const str = bigIntValue.toString();
		const len = str.length;
		if (len <= 6) {
			return Number(`0.${str.padStart(6, "0")}`);
		}
		const integerPart = str.slice(0, len - 6);
		const decimalPart = str.slice(len - 6);
		return Number(`${integerPart}.${decimalPart}`);
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

		const lossesData = [];
		const profitsData = [];

		let totalPnlAmountBigInt = 0n;
		let totalInvestedAmountBigInt = 0n;
		let positiveCount = 0;
		let negativeCount = 0;

		for (let i = 0; i < rawData.length; i += 7) {
			const symbolIndex = rawData[i];
			const position = this.positions[symbolIndex];

			if (!position) continue;

			const [quantity, entryPrice] = position;
			const currentPrice = rawData[i + 1];

			// Convert all values to high-precision BigInt
			const currentPriceBigInt = this.toBigIntPrecise(currentPrice);
			const entryPriceBigInt = this.toBigIntPrecise(entryPrice);
			const quantityBigInt = this.toBigIntPrecise(quantity);

			// Perform all calculations in BigInt
			const priceDiffBigInt = currentPriceBigInt - entryPriceBigInt;
			const unrealizedPLBigInt =
				(priceDiffBigInt * quantityBigInt) / this.PRECISION_FACTOR;
			const investedAmountBigInt =
				(entryPriceBigInt * quantityBigInt) / this.PRECISION_FACTOR;

			// Calculate percentage using BigInt arithmetic
			const unrealizedPLPercentageBigInt =
				entryPriceBigInt > 0n
					? (priceDiffBigInt * 10000n) / entryPriceBigInt // 10000n for percentage with 2 decimal places
					: 0n;

			// Convert to numbers for output
			const unrealizedPL = this.fromBigIntPrecise(unrealizedPLBigInt);
			const unrealizedPLPercentage = Number(unrealizedPLPercentageBigInt) / 100;

			totalPnlAmountBigInt += unrealizedPLBigInt;
			totalInvestedAmountBigInt += investedAmountBigInt;

			if (unrealizedPLBigInt > 0n) {
				positiveCount++;
			} else if (unrealizedPLBigInt < 0n) {
				negativeCount++;
			}

			const stockData = [
				symbolIndex,
				rawData[i + 1], // last
				rawData[i + 2], // change
				rawData[i + 3], // changePercentage
				rawData[i + 4], // high
				rawData[i + 5], // low
				rawData[i + 6], // volume
				unrealizedPL,
				unrealizedPLPercentage,
			];

			if (unrealizedPLPercentageBigInt < 0n) {
				lossesData.push(stockData);
			} else {
				profitsData.push(stockData);
			}
		}

		// Sort using the calculated percentage values
		lossesData.sort((a, b) => a[8] - b[8]);
		profitsData.sort((a, b) => b[8] - a[8]);

		const enhancedData = lossesData.concat(profitsData).flat();
		const totalPnlAmount = this.fromBigIntPrecise(totalPnlAmountBigInt);

		const totalPnlPercentage =
			totalInvestedAmountBigInt > 0n
				? Number((totalPnlAmountBigInt * 10000n) / totalInvestedAmountBigInt) /
					100
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
