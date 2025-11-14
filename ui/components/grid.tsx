import { type JSX, useMemo } from "react";
import { StockCard } from "@/components/stock-card";
import type { PLHeader, PLUpdate } from "@/hooks/use-profit-and-loss-data";

function renderStockCards(
	header: PLHeader,
	update: PLUpdate,
	positions: Record<number, [number, number]>,
): JSX.Element[] {
	const cards: JSX.Element[] = [];

	// Iterate through data in chunks of 9 indices at a time
	for (let index = 0; index < update.data.length; index += 9) {
		const symbolIndex = update.data[index];

		// Skip if we don't have enough data for a complete record
		if (index + 8 >= update.data.length) {
			break;
		}

		const symbol = header.symbols[symbolIndex];
		const name = header.names[symbolIndex];

		// [index, last, change, changePercentage, high, low, volume, unrealizedPL, unrealizedPLPercentage]
		const stockData = update.data.slice(index, index + 9);

		// Get position data for this symbol
		const position = positions[symbolIndex];

		if (position && stockData) {
			const shares = position ? position[0] : 0;
			const avgCost = position ? position[1] : null;

			cards.push(
				<StockCard
					key={symbol}
					symbol={symbol}
					name={name}
					last={stockData[1]}
					change={stockData[2]}
					changePercentage={stockData[3]}
					unrealizedPL={stockData[7]}
					unrealizedPLercentage={stockData[8]}
					shares={shares}
					avgCost={avgCost}
				/>,
			);
		}
	}

	return cards;
}

export function StockGrid(props: {
	header: PLHeader | null;
	update: PLUpdate | null;
	positions: Record<number, [number, number]>;
}) {
	const { header, update, positions } = props;
	const stockCards = useMemo(() => {
		if (!update || !header) {
			return <div>Loading...</div>;
		}
		return renderStockCards(header, update, positions);
	}, [header, update, positions]);
	return <div className="grid grid-cols-20 gap-2">{stockCards}</div>;
}
