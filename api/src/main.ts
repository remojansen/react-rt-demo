import path from "node:path";
import protobuf from "protobufjs";
import { GenericObservable } from "./generic-observable";
import { FastMockUpdatesGenerator } from "./mock-data-generator";
import { WebSocketServer } from "./web-socket";

const PORT: number = parseInt(process.env.PORT || "8080", 10);
const fastMockUpdatesGenerator = new FastMockUpdatesGenerator();

export async function main() {
	const protoPath = path.join(__dirname, "..", "proto", "demo.proto");
	const root = await protobuf.load(protoPath);
	const HeaderData = root.lookupType("HeaderData");
	const PriceUpdates = root.lookupType("PriceUpdates");
	const symbolMessage = HeaderData.create(
		fastMockUpdatesGenerator.getPositions(),
	);
	const symbolDataBuffer = HeaderData.encode(symbolMessage).finish();
	const PriceUpdatesStream = new GenericObservable<Uint8Array<ArrayBufferLike>>(
		function* () {
			while (true) {
				fastMockUpdatesGenerator.batchUpdate();
				const updatedStocks = fastMockUpdatesGenerator.getUpdatedStocks();
				const message = PriceUpdates.create({
					data: updatedStocks,
				});
				yield PriceUpdates.encode(message).finish();
			}
		},
	);

	const PriceUpdatesWebSocket = new WebSocketServer(
		symbolDataBuffer,
		PriceUpdatesStream,
	);

	PriceUpdatesWebSocket.listen(PORT);
}
