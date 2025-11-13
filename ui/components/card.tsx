import type React from "react";

interface CardProps {
	children: React.ReactNode;
	className?: string;
}

export default function Card({ children, className = "" }: CardProps) {
	return (
		<div className={`rounded-lg shadow-md ${className || "bg-neutral-800"}`}>
			{children}
		</div>
	);
}
