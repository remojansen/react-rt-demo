"use client";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from "react";
import { StockCard } from "@/components/stock-card";
import { Summary } from "@/components/summary";
import {
	type PLAggregates,
	type PLHeader,
	type PLMessage,
	type PLUpdate,
	useProfitAndLossData,
} from "@/hooks/use-profit-and-loss-data";
import { usePositions } from "@/hooks/user-positions";

// Moved outside component - pure function that doesn't depend on closure
function renderStockCards(
	header: PLHeader | null,
	update: PLUpdate | null,
	positions: Record<number, [number, number]>,
) {
	if (!update || !header) {
		return <div>Loading...</div>;
	}

	const cards = [];

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

export default function Home() {
	const { subscribe, connect, isConnected, error } = useProfitAndLossData();
	const { positions } = usePositions();
	const [header, setHeader] = useState<PLHeader | null>(null);
	const [update, setUpdate] = useState<PLUpdate | null>(null);
	const [aggregates, setAggregates] = useState<PLAggregates>({
		pnlAmount: 0,
		pnlPercentage: 0,
		pCount: 0,
		lCount: 0,
	});

	// Defer expensive stock cards rendering during rapid updates
	const deferredUpdate = useDeferredValue(update);
	const deferredHeader = useDeferredValue(header);
	const deferredAggregates = useDeferredValue(aggregates);

	// Use deferred values for stock cards to prevent blocking urgent updates
	const stockCards = useMemo(() => {
		return renderStockCards(deferredHeader, deferredUpdate, positions);
	}, [deferredHeader, deferredUpdate, positions]);

	useEffect(() => {
		connect();
	}, [connect]);

	// Memoize message handler to prevent subscription recreation
	const handleMessage = useCallback((message: PLMessage) => {
		if (message.type === "header") {
			setHeader(message.data);
		} else if (message.type === "update") {
			setUpdate(message.data);
			setAggregates(message.data.aggregates);
		}
	}, []);

	useEffect(() => {
		const unsubscribe = subscribe(handleMessage);
		return unsubscribe;
	}, [subscribe, handleMessage]);

	if (error) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-8">
				<div className="max-w-6xl mx-auto">
					<div className="text-center text-red-500">Error: {error}</div>
				</div>
			</div>
		);
	}

	if (!isConnected || !header) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-8">
				<div className="max-w-6xl mx-auto">
					<div className="text-center text-white">
						{!isConnected ? "Connecting..." : "Loading stock data..."}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-8">
			<div>
				<h1 className="text-4xl font-bold text-white mb-6">Real-Time P&L Dashboard</h1>
				{/* Summary updates immediately */}
				<Summary aggregates={deferredAggregates} />
				{/* Stock cards update with deferred values for smoother performance */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-20 gap-2">
					{stockCards}
				</div>
			</div>
		</div>
	);
}
