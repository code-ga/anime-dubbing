import type { KeyEvent } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useState } from "react";
import type { LogEntry } from "../hooks/usePipelineLogger";

interface LogViewerProps {
	logs: LogEntry[];
	maxHeight?: number;
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function getLogColor(level: string): string | undefined {
	if (level === "warn") return "#eab308";
	if (level === "error") return "#ef4444";
	if (level === "debug") return "#6b7280";
	return undefined;
}

function getLogAttributes(level: string) {
	if (level === "debug") return TextAttributes.DIM;
	return undefined;
}

export function LogViewer({ logs, maxHeight = 12 }: LogViewerProps) {
	const [scrollOffset, setScrollOffset] = useState(0);
	const displayLogs = logs.slice(
		-maxHeight * 2 + scrollOffset,
		logs.length - scrollOffset,
	);
	const maxOffset = Math.max(0, logs.length - maxHeight);

	const handleKeyDown = (key: KeyEvent) => {
		const keyName = key.name;
		if (keyName === "up" || keyName === "k") {
			setScrollOffset((prev) => Math.min(prev + 1, maxOffset));
		} else if (keyName === "down" || keyName === "j") {
			setScrollOffset((prev) => Math.max(prev - 1, 0));
		}
	};

	const scrollIndicator =
		maxOffset > 0
			? scrollOffset === 0
				? "↓"
				: scrollOffset === maxOffset
					? "↑"
					: "↕"
			: "";

	return (
		<box
			border
			borderStyle="rounded"
			padding={1}
			flexDirection="column"
			gap={0}
			height={Math.min(displayLogs.length + 2, maxHeight + 2)}
			onKeyDown={handleKeyDown}
		>
			<box flexDirection="row" justifyContent="space-between">
				<text attributes={TextAttributes.BOLD}>Logs</text>
				<text attributes={TextAttributes.DIM}>
					{displayLogs.length} {scrollIndicator}
				</text>
			</box>
			<box flexDirection="column" gap={0}>
				{displayLogs.map((entry) => (
					<text
						key={entry.id}
						fg={getLogColor(entry.level)}
						attributes={getLogAttributes(entry.level)}
					>
						[{formatTime(entry.timestamp)}] {entry.message}
					</text>
				))}
			</box>
		</box>
	);
}
