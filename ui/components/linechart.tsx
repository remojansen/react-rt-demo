"use client";

import type React from "react";
import { memo, useEffect, useRef } from "react";

interface LineChartCanvasProps {
	data: number[];
}

const LineChartCanvas: React.FC<LineChartCanvasProps> = memo(
	({ data }) => {
		const canvasRef = useRef<HTMLCanvasElement>(null);

		useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas || data.length === 0) return;

			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			// Get container dimensions
			const parent = canvas.parentElement;
			const width = parent?.clientWidth || 300;
			const height = 25;

			// Set canvas size
			canvas.width = width;
			canvas.height = height;

			// Clear canvas
			ctx.clearRect(0, 0, width, height);

			// Find min/max for scaling
			const max = Math.max(...data);
			const min = Math.min(...data);
			const range = max - min || 1;

			const padding = 2;
			const plotHeight = height - 2 * padding;
			const plotWidth = width - 2 * padding;

			// Draw line
			ctx.beginPath();
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";

			data.forEach((value, i) => {
				const x = padding + (i / (data.length - 1)) * plotWidth;
				const y = padding + plotHeight - ((value - min) / range) * plotHeight;

				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			});

			ctx.stroke();
		}, [data]);

		return (
			<div style={{ width: "100%", height: "25px", position: "relative" }}>
				<canvas
					ref={canvasRef}
					style={{ width: "100%", height: "100%", display: "block" }}
				/>
			</div>
		);
	},
	(prevProps, nextProps) => {
		// Custom comparison - only re-render if data length changed significantly
		// or if the last few values are different
		if (prevProps.data.length !== nextProps.data.length) return false;

		// Compare last 5 values to avoid re-rendering on every tiny change
		const prevLast5 = prevProps.data.slice(-5);
		const nextLast5 = nextProps.data.slice(-5);

		return prevLast5.every((val, i) => val === nextLast5[i]);
	},
);

export default LineChartCanvas;
