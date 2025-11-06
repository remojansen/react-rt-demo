import type React from "react";

interface CardProps {
	children: React.ReactNode;
	className?: string;
}

export default function Card({ children, className = "" }: CardProps) {
	return (
		<div className={`bg-neutral-800 rounded-lg shadow-md p-6 ${className}`}>
			{children}
		</div>
	);
}

interface StockCardProps {
	symbol: string;
	name: string;
	last: number;
	change: number;
	changePercentage: number;
}

export function StockCard({
	symbol,
	name,
	last,
	change,
	changePercentage,
}: StockCardProps) {
	const isPositive = change >= 0;

	return (
		<Card className="hover:shadow-lg transition-shadow">
			<div className="space-y-2">
				<div className="flex justify-between items-start">
					<div>
						<h3 className="font-semibold text-lg text-white">{symbol}</h3>
						<p className="text-sm text-gray-300 truncate">{name}</p>
					</div>
					<div className="text-right">
						<div className="text-xl font-bold text-white">
							${last.toFixed(2)}
						</div>
					</div>
				</div>
				<div className="flex items-center space-x-2">
					<span
						className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
							isPositive
								? "bg-green-100 text-green-800"
								: "bg-red-100 text-red-800"
						}`}
					>
						{isPositive ? "+" : ""}
						{change.toFixed(2)}
					</span>
					<span
						className={`text-sm font-medium ${
							isPositive ? "text-green-600" : "text-red-600"
						}`}
					>
						({isPositive ? "+" : ""}
						{changePercentage.toFixed(2)}%)
					</span>
				</div>
			</div>
		</Card>
	);
}
