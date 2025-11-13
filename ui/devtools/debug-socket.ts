import path from "node:path";
import protobuf from "protobufjs";
import WebSocket from "ws";

interface HeaderData {
	symbols: string[];
	names: string[];
}

interface PriceUpdates {
	data: number[];
}

type Message<THeader extends object, TUpdate extends object> =
	| {
			type: "header";
			data: THeader;
	  }
	| {
			type: "update";
			data: TUpdate;
	  };

class NodeWebSocketClient<THeader extends object, TUpdate extends object> {
	private _ws: WebSocket;
	private _updateType: protobuf.Type;
	private _headerType: protobuf.Type;

	public constructor(
		headerType: protobuf.Type,
		updateType: protobuf.Type,
		wsURL: string,
	) {
		this._headerType = headerType;
		this._updateType = updateType;
		this._ws = new WebSocket(wsURL);
	}

	public async listen(): Promise<AsyncIterable<Message<THeader, TUpdate>>> {
		let isFirstMessage = true;

		return {
			[Symbol.asyncIterator]: () => {
				const messageQueue: Message<THeader, TUpdate>[] = [];
				let resolveNext:
					| ((value: IteratorResult<Message<THeader, TUpdate>>) => void)
					| null = null;

				this._ws.on("open", () => {
					// Connection established silently
				});

				this._ws.on("message", (data: Buffer) => {
					try {
						const uint8Array = new Uint8Array(data);

						const decodedData = isFirstMessage
							? (this._headerType.decode(uint8Array) as THeader)
							: (this._updateType.decode(uint8Array) as TUpdate);

						const message: Message<THeader, TUpdate> = isFirstMessage
							? { type: "header", data: decodedData as THeader }
							: { type: "update", data: decodedData as TUpdate };

						isFirstMessage = false;

						if (resolveNext) {
							resolveNext({ value: message, done: false });
							resolveNext = null;
						} else {
							messageQueue.push(message);
						}
					} catch (_error) {
						// Error handling silently
					}
				});

				this._ws.on("error", (_error) => {
					// Error handling silently
				});

				this._ws.on("close", () => {
					if (resolveNext) {
						resolveNext({ value: undefined, done: true });
					}
				});

				return {
					next: async (): Promise<
						IteratorResult<Message<THeader, TUpdate>>
					> => {
						if (messageQueue.length > 0) {
							const shiftedMessage = messageQueue.shift();
							if (shiftedMessage) {
								return { value: shiftedMessage, done: false };
							}
						}

						return new Promise<IteratorResult<Message<THeader, TUpdate>>>(
							(resolve) => {
								resolveNext = resolve;
							},
						);
					},
				};
			},
		};
	}

	public close() {
		this._ws.close();
	}
}

async function main() {
	try {
		const protoPath = path.join(__dirname, "..", "public", "demo.proto");
		const root = await protobuf.load(protoPath);
		const HeaderDataType = root.lookupType("HeaderData");
		const PriceUpdatesType = root.lookupType("PriceUpdates");

		const wsURL = "ws://localhost:8080";
		const client = new NodeWebSocketClient<HeaderData, PriceUpdates>(
			HeaderDataType,
			PriceUpdatesType,
			wsURL,
		);

		const messageStream = await client.listen();

		for await (const message of messageStream) {
			console.log(JSON.stringify(message, null, 2));
		}
	} catch (_error) {
		// Error handling silently
	}
}

process.on("SIGINT", () => {
	process.exit(0);
});

process.on("SIGTERM", () => {
	process.exit(0);
});

main().catch(() => {});
