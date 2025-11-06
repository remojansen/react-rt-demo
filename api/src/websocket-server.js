const WebSocket = require("ws");
const http = require("node:http");

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
	console.log("New WebSocket connection established");

	// Send welcome message
	ws.send(
		JSON.stringify({
			type: "welcome",
			message: "Connected to WebSocket server",
		}),
	);

	// Handle incoming messages
	ws.on("message", (data) => {
		try {
			const message = JSON.parse(data);
			console.log("Received:", message);

			// Echo the message back to the client
			ws.send(
				JSON.stringify({
					type: "echo",
					data: message,
				}),
			);

			// Broadcast to all connected clients
			wss.clients.forEach((client) => {
				if (client !== ws && client.readyState === WebSocket.OPEN) {
					client.send(
						JSON.stringify({
							type: "broadcast",
							data: message,
						}),
					);
				}
			});
		} catch (error) {
			console.error("Error parsing message:", error);
		}
	});

	// Handle connection close
	ws.on("close", () => {
		console.log("WebSocket connection closed");
	});

	// Handle errors
	ws.on("error", (error) => {
		console.error("WebSocket error:", error);
	});
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
	console.log(`WebSocket server is running on port ${PORT}`);
});
