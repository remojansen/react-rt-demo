import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

const POSITION_PER_STOCK = 100000;

type PositionsContextType = {
	positions: [number, number][];
	setPositions: React.Dispatch<React.SetStateAction<[number, number][]>>;
};

const PositionsContext = createContext<PositionsContextType | undefined>(
	undefined,
);

interface PositionsProviderProps {
	children: ReactNode;
}

interface Item {
	symbol: string;
	name: string;
	last: number;
	change: number;
	changePercentage: number;
	high: number;
	low: number;
	volume: number;
}

const fastRandom = (() => {
	let seed = Date.now() % 2147483647;
	return () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};
})();

export function PositionsProvider({ children }: PositionsProviderProps) {
	const [positions, setPositions] = useState<[number, number][]>([]);

	useEffect(() => {
		fetch("/data/s&p-500.json")
			.then((response) => response.json())
			.then((data: Item[]) => {
				// ~200 random fake positions from the S&P 500 dataset
				const positions: [number, number][] = [];
				data.forEach((item, index) => {
					const isSelected = fastRandom() < 0.4;
					if (isSelected) {
						// Apply random variation of ±0.1% to the last price
						const variation = (fastRandom() - 0.5) * 0.002;
						const adjustedPrice = item.last * (1 + variation);
						positions[index] = [
							Math.floor(POSITION_PER_STOCK / adjustedPrice),
							adjustedPrice,
						];
					}
				});
				setPositions(positions);
			});
	}, []);

	const value = {
		positions,
		setPositions,
	};

	return (
		<PositionsContext.Provider value={value}>
			{children}
		</PositionsContext.Provider>
	);
}

export function usePositions() {
	const context = useContext(PositionsContext);
	if (context === undefined) {
		throw new Error("usePositions must be used within a PositionsProvider");
	}
	return context;
}
