import { useCallback, useEffect, useRef } from "react";
import Card from "./card";
import LineChartCanvas from "./linechart";

interface StockCardProps {
	symbol: string;
	name: string;
	last: number;
	change: number;
	changePercentage: number;
	unrealizedPL: number;
	unrealizedPLercentage: number;
	shares: number;
	avgCost: number | null;
}

// Pure function to determine background color based on P&L percentage
function getPLBackgroundColor(percentage: number): string {
	if (percentage >= 10) {
		return "bg-green-600 text-black";
	} else if (percentage >= 5) {
		return "bg-green-500 text-black";
	} else if (percentage >= 2) {
		return "bg-green-400 text-black";
	} else if (percentage >= 1) {
		return "bg-green-300 text-black";
	} else if (percentage > 0) {
		return "bg-green-200 text-black";
	} else if (percentage === 0) {
		return "bg-neutral-600";
	} else if (percentage > -1) {
		return "bg-red-200 text-black";
	} else if (percentage > -2) {
		return "bg-red-300 text-black";
	} else if (percentage > -5) {
		return "bg-red-400 text-black";
	} else if (percentage > -10) {
		return "bg-red-500 text-black";
	} else {
		return "bg-red-600 text-black";
	}
}

export function StockCard({
	symbol,
	name,
	last,
	change,
	changePercentage,
	unrealizedPL,
	unrealizedPLercentage,
	shares,
	avgCost,
}: StockCardProps) {
	// Calculate position value (market value of the position)
	const positionValue = shares * last;
	const priceHistory = useRef<number[]>([last]);
	const updateTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

	const debouncedUpdateHistory = useCallback((newPrice: number) => {
		if (updateTimeoutRef.current) {
			clearTimeout(updateTimeoutRef.current);
		}

		updateTimeoutRef.current = setTimeout(() => {
			priceHistory.current = [...priceHistory.current.slice(-100), newPrice];
		}, 16); // ~60fps
	}, []);

	useEffect(() => {
		debouncedUpdateHistory(last);
	}, [last, debouncedUpdateHistory]);

	return (
		<div className="relative group">
			<Card
				className={`hover:shadow-lg transition-all duration-200 p-2 cursor-pointer ${getPLBackgroundColor(unrealizedPLercentage)}`}
			>
				{/* Compact view - only key data */}
				<div className="space-y-1">
					<div className="text-center">
						<h3 className="font-bold truncate" style={{ fontSize: "10px" }}>
							{symbol}
						</h3>
						<div className="text-xs font-bold">
							{unrealizedPLercentage >= 0 ? "+" : ""}
							{unrealizedPLercentage.toFixed(2)}%
						</div>
						<div className="font-semibold" style={{ fontSize: "10px" }}>
							{unrealizedPL >= 0 ? "+" : ""}${unrealizedPL.toFixed(2)}
						</div>
						<div className="font-semibold" style={{ fontSize: "10px" }}>
							${last.toFixed(2)}
						</div>
						<LineChartCanvas data={priceHistory.current} />
					</div>
				</div>
			</Card>

			{/* Hover popup with detailed information */}
			<div className="absolute top-0 left-full ml-2 bg-gray-800 text-white p-3 rounded-lg shadow-lg border border-gray-600 z-50 min-w-64 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
				<div className="space-y-2">
					<div className="border-b border-gray-600 pb-2 mb-2">
						<h3 className="font-semibold text-sm">{symbol}</h3>
						<p style={{ fontSize: "10px" }} className="text-gray-300">
							{name}
						</p>
						<div className="text-lg font-bold text-white">
							${last.toFixed(2)}
						</div>
					</div>

					<div className="space-y-1" style={{ fontSize: "10px" }}>
						<div className="flex justify-between items-center">
							<span className="text-gray-300">Shares:</span>
							<span className="font-semibold text-white">
								{shares.toLocaleString()}
							</span>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-gray-300">Avg Cost:</span>
							<span className="font-semibold text-white">
								${avgCost !== null ? avgCost.toFixed(2) : "N/A"}
							</span>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-gray-300">Market Value:</span>
							<span className="font-semibold text-white">
								${positionValue.toFixed(2)}
							</span>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-gray-300">Day Change:</span>
							<span
								className={`font-semibold ${change >= 0 ? "text-green-400" : "text-red-400"}`}
							>
								{change >= 0 ? "+" : ""}${change.toFixed(2)}
							</span>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-gray-300">Day Change %:</span>
							<span
								className={`font-semibold ${changePercentage >= 0 ? "text-green-400" : "text-red-400"}`}
							>
								{changePercentage >= 0 ? "+" : ""}
								{changePercentage.toFixed(2)}%
							</span>
						</div>
						<div className="flex justify-between items-center border-t border-gray-600 pt-1 mt-2">
							<span className="text-gray-300">Unrealized P&L:</span>
							<span
								className={`font-semibold ${unrealizedPL >= 0 ? "text-green-400" : "text-red-400"}`}
							>
								{unrealizedPL >= 0 ? "+" : ""}${unrealizedPL.toFixed(2)}
							</span>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-gray-300">Unrealized P&L %:</span>
							<span
								className={`font-semibold ${unrealizedPLercentage >= 0 ? "text-green-400" : "text-red-400"}`}
							>
								{unrealizedPLercentage >= 0 ? "+" : ""}
								{unrealizedPLercentage.toFixed(2)}%
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
