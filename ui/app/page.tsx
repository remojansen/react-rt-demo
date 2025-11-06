"use client";
import { StockCard } from "@/components/card";
import { useWebSocket } from "@/hooks/use-shared-worker";

// Helper function to parse stock data
function parseStockData(tradingData: any, symbolData: any) {
	console.log("parseStockData called with:", {
		tradingData: tradingData ? {
			dataLength: tradingData.data?.length,
			stockCount: tradingData.stock_count,
			firstFewValues: tradingData.data?.slice(0, 14)
		} : null,
		symbolData: symbolData ? {
			symbolsLength: symbolData.symbols?.length,
			namesLength: symbolData.names?.length,
			firstFewSymbols: symbolData.symbols?.slice(0, 5)
		} : null
	});

	if (!tradingData || !symbolData || !tradingData.data) {
		console.log("Missing required data for parsing");
		return [];
	}

	const stocks = [];
	const data = tradingData.data;

	// Each stock has 7 values: [stockIndex, last, change, changePercentage, high, low, volume]
	for (let i = 0; i < data.length; i += 7) {
		if (i + 6 < data.length) {
			const stockIndex = data[i];
			const last = data[i + 1];
			const change = data[i + 2];
			const changePercentage = data[i + 3];
			const high = data[i + 4];
			const low = data[i + 5];
			const volume = data[i + 6];

			// Get symbol and name from symbolData
			const symbol = symbolData.symbols[stockIndex] || `STOCK${stockIndex}`;
			const name = symbolData.names[stockIndex] || `Stock ${stockIndex}`;

			stocks.push({
				stockIndex,
				symbol,
				name,
				last,
				change,
				changePercentage,
				high,
				low,
				volume,
			});
		}
	}

	console.log("Parsed stocks:", stocks.length, "first few:", stocks.slice(0, 3));
	return stocks;
}

export default function Home() {
	const { tradingData, symbolData, connectionStatus } = useWebSocket(
		"ws://localhost:8080",
	);

	// Parse stock data
	const stocks = parseStockData(tradingData, symbolData);

	return (
		<div className="min-h-screen bg-neutral-900 p-6">
			<div className="max-w-7xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-4">
						P&L Dashboard
					</h1>
					<div className="flex items-center space-x-4">
						<div className="flex items-center space-x-2">
							<div
								className={`w-3 h-3 rounded-full ${
									connectionStatus === "connected"
										? "bg-green-500"
										: connectionStatus === "connecting"
											? "bg-yellow-500"
											: "bg-red-500"
								}`}
							/>
							<span className="text-sm font-medium capitalize">
								{connectionStatus}
							</span>
						</div>
					<span className="text-sm text-gray-300">
						{stocks.length} stocks • {new Date().toLocaleTimeString()}
					</span>
					</div>
				</div>

				{connectionStatus === "connected" && stocks.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
						{stocks.map((stock) => (
							<StockCard
								key={`${stock.symbol}-${stock.stockIndex}`}
								symbol={stock.symbol}
								name={stock.name}
								last={stock.last}
								change={stock.change}
								changePercentage={stock.changePercentage}
							/>
						))}
					</div>
				) : (
				<div className="text-center py-12">
					<div className="text-gray-300">
							{connectionStatus === "connecting" ? (
								<>Connecting to market data...</>
							) : connectionStatus === "error" ? (
								<>
									Connection error. Please check if the WebSocket server is
									running.
								</>
							) : (
								<>Waiting for market data...</>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
