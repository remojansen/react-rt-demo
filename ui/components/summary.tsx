import { memo, useMemo } from "react";
import Card from "./card";

// Helper function to format currency
const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

// Helper function to format percentage
const formatPercentage = (percentage: number): string => {
	return `${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}%`;
};

// Helper function to get P&L background color
function getPLBackgroundColor(percentage: number): string {
	if (percentage >= 10) {
		return "bg-green-600 text-white";
	} else if (percentage >= 5) {
		return "bg-green-500 text-white";
	} else if (percentage >= 2) {
		return "bg-green-400 text-white";
	} else if (percentage >= 1) {
		return "bg-green-300 text-white";
	} else if (percentage > 0) {
		return "bg-green-200 text-white";
	} else if (percentage === 0) {
		return "bg-neutral-600 text-white";
	} else if (percentage > -1) {
		return "bg-red-200 text-white";
	} else if (percentage > -2) {
		return "bg-red-300 text-white";
	} else if (percentage > -5) {
		return "bg-red-400 text-white";
	} else if (percentage > -10) {
		return "bg-red-500 text-white";
	} else {
		return "bg-red-600 text-white";
	}
}

interface SummaryProps {
	aggregates: {
		pnlAmount: number;
		pnlPercentage: number;
		pCount: number;
		lCount: number;
	};
}

export const Summary = memo(function Summary(props: SummaryProps) {
	const { aggregates } = props;

	// Memoize expensive calculations
	const memoizedValues = useMemo(() => {
		const pnlColorClass = getPLBackgroundColor(aggregates.pnlPercentage);
		const formattedPnlAmount = formatCurrency(aggregates.pnlAmount);
		const formattedPnlPercentage = formatPercentage(aggregates.pnlPercentage);
		const totalPositions = aggregates.lCount + aggregates.pCount;

		return {
			pnlColorClass,
			formattedPnlAmount,
			formattedPnlPercentage,
			totalPositions,
		};
	}, [
		aggregates.pnlAmount,
		aggregates.pnlPercentage,
		aggregates.lCount,
		aggregates.pCount,
	]);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
			<Card
				className={`p-2 ${memoizedValues.pnlColorClass} border-l-4 ${aggregates.pnlAmount >= 0 ? "border-green-400" : "border-red-400"}`}
			>
				<div className="flex flex-col space-y-2">
					<h3 className="text-sm font-semibold opacity-90 tracking-wide uppercase">
						Unrealized P&L ($)
					</h3>
					<div className="flex items-center space-x-2">
						<span className="text-2xl font-bold">
							{memoizedValues.formattedPnlAmount}
						</span>
					</div>
				</div>
			</Card>

			<Card
				className={`p-2 ${memoizedValues.pnlColorClass} border-l-4 ${aggregates.pnlPercentage >= 0 ? "border-green-400" : "border-red-400"}`}
			>
				<div className="flex flex-col space-y-2">
					<h3 className="text-sm font-semibold opacity-90 tracking-wide uppercase">
						Unrealized P&L (%)
					</h3>
					<div className="flex items-center space-x-2">
						<span className="text-2xl font-bold">
							{memoizedValues.formattedPnlPercentage}
						</span>
					</div>
				</div>
			</Card>

			<Card className="p-2 bg-gradient-to-br from-green-500 to-green-600 text-white border-l-4 border-green-300">
				<div className="flex flex-col space-y-2">
					<h3 className="text-sm font-semibold opacity-90 tracking-wide uppercase">
						Positive Positions
					</h3>
					<div className="flex items-center space-x-2">
						<span className="text-3xl font-bold">{aggregates.pCount}</span>
					</div>
				</div>
			</Card>

			<Card className="p-2 bg-gradient-to-br from-red-500 to-red-600 text-white border-l-4 border-red-300">
				<div className="flex flex-col space-y-2">
					<h3 className="text-sm font-semibold opacity-90 tracking-wide uppercase">
						Negative Positions
					</h3>
					<div className="flex items-center space-x-2">
						<span className="text-3xl font-bold">{aggregates.lCount}</span>
					</div>
				</div>
			</Card>
			<Card className="p-2 text-white border-l-4 bg-neutral-800 border-neutral-500">
				<div className="flex flex-col space-y-2">
					<h3 className="text-sm font-semibold opacity-90 tracking-wide uppercase">
						Total Positions
					</h3>
					<div className="flex items-center space-x-2">
						<span className="text-3xl font-bold">
							{memoizedValues.totalPositions}
						</span>
					</div>
				</div>
			</Card>
		</div>
	);
});
