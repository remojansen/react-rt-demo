"use client";
import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { StockGrid } from "@/components/grid";
import { Summary } from "@/components/summary";
import {
	type PLAggregates,
	type PLHeader,
	type PLMessage,
	type PLUpdate,
	useProfitAndLossData,
} from "@/hooks/use-profit-and-loss-data";
import { usePositions } from "@/hooks/user-positions";

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
				<h1 className="text-4xl font-bold text-white mb-6">
					Real-Time P&L Dashboard
				</h1>
				<Summary aggregates={deferredAggregates} />
				<StockGrid
					header={deferredHeader}
					update={deferredUpdate}
					positions={positions}
				/>
			</div>
		</div>
	);
}
