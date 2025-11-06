"use client";

import React from "react";
import { useWebSocket } from "@/hooks/use-shared-worker";

export default function Home() {
	const { tradingData, symbolData, connectionStatus } = useWebSocket(
		"ws://localhost:8080",
	);

	// Debug logging
	console.log("Connection Status:", connectionStatus);
	console.log("Symbol Data:", symbolData);
	console.log("Trading Data:", tradingData);

	// Test simple WebSocket connection
	React.useEffect(() => {
		console.log("Component mounted, testing WebSocket...");
		const ws = new WebSocket("ws://localhost:8080");
		ws.onopen = () => {
			console.log("TEST: WebSocket opened successfully!");
		};
		ws.onerror = (error) => {
			console.log("TEST: WebSocket error:", error);
		};
		ws.onclose = () => {
			console.log("TEST: WebSocket closed");
		};

		return () => {
			console.log("Component unmounting, closing test WebSocket");
			ws.close();
		};
	}, []);

	return (
		<div style={{ padding: "20px" }}>
			<h2>Debug Information</h2>
			<div>
				Connection Status: <strong>{connectionStatus}</strong>
			</div>
			<div>
				Trading Data Available: <strong>{tradingData ? "Yes" : "No"}</strong>
			</div>
			<div>
				Symbol Data Available: <strong>{symbolData ? "Yes" : "No"}</strong>
			</div>
			<div>
				Current Time: <strong>{new Date().toLocaleTimeString()}</strong>
			</div>

			<hr />

			<h2>Raw Data</h2>
			<pre style={{ fontSize: "12px", padding: "10px" }}>
				Trading Data: {JSON.stringify(tradingData, null, 2)}
			</pre>
			<pre style={{ fontSize: "12px", padding: "10px" }}>
				Symbol Data: {JSON.stringify(symbolData, null, 2)}
			</pre>
			{symbolData && (
				<div>
					<h3>Symbols:</h3>
					<ul>
						{symbolData.symbols.map((symbol, index) => (
							<li key={symbol}>
								{symbol} - {symbolData.names[index]}
							</li>
						))}
					</ul>
				</div>
			)}
			{tradingData && (
				<div>
					<h3>Trading Updates:</h3>
					<p>Stock Count: {tradingData.stock_count}</p>
					<p>Data Length: {tradingData.data.length}</p>
					{/* Each stock has 7 values: [stockIndex, last, change, changePercentage, high, low, volume] */}
				</div>
			)}
		</div>
	);
}
