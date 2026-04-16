import { useCallback, useRef } from "react";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
	id: number;
	timestamp: Date;
	level: LogLevel;
	message: string;
}

const MAX_LOGS = 500;

export function usePipelineLogger() {
	const logsRef = useRef<LogEntry[]>([]);
	const idCounterRef = useRef(0);

	const addLog = useCallback((level: LogLevel, message: string) => {
		const entry: LogEntry = {
			id: idCounterRef.current++,
			timestamp: new Date(),
			level,
			message,
		};
		logsRef.current.push(entry);

		if (logsRef.current.length > MAX_LOGS) {
			logsRef.current = logsRef.current.slice(-MAX_LOGS);
		}
	}, []);

	const clearLogs = useCallback(() => {
		logsRef.current = [];
	}, []);

	const getLogs = useCallback(() => {
		return logsRef.current;
	}, []);

	return {
		addLog,
		clearLogs,
		getLogs,
		logs: logsRef,
	};
}
