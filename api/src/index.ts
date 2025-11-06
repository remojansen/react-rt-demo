import path from "node:path";
import protobuf from "protobufjs";
import { GenericObservable } from "./generic-observable";
import { FastMockUpdatesGenerator } from "./mock-data-generator";
import { WebSocketServer } from "./web-socket";

const PORT: number = parseInt(process.env.PORT || "8080", 10);
const fastMockUpdatesGenerator = new FastMockUpdatesGenerator();

async function main() {
	const protoPath = path.join(__dirname, "..", "proto", "demo.proto");
	const root = await protobuf.load(protoPath);
	const SymbolData = root.lookupType("SymbolData");
	const TradingUpdates = root.lookupType("TradingUpdates");
	const symbolMessage = SymbolData.create(
		fastMockUpdatesGenerator.getSymbolsAndNames(),
	);
	const symbolDataBuffer = SymbolData.encode(symbolMessage).finish();
	const tradingUpdatesStream = new GenericObservable<
		Uint8Array<ArrayBufferLike>
	>(symbolDataBuffer, function* () {
		while (true) {
			fastMockUpdatesGenerator.batchUpdate();
			const updatedStocks = fastMockUpdatesGenerator.getUpdatedStocks();
			const message = TradingUpdates.create({
				data: updatedStocks,
				stock_count: updatedStocks.length / 7  // Each stock has 7 values
			});
			yield TradingUpdates.encode(message).finish();
		}
	});

	const tradingUpdatesWebSocket = new WebSocketServer(tradingUpdatesStream);

	tradingUpdatesWebSocket.listen(PORT);
}

main();
