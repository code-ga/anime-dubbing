import * as fs from "fs";
import * as path from "path";
import type { LogLevel } from "../hooks/usePipelineLogger";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

export type LogCallback = (level: LogLevel, message: string) => void;
let logCallback: LogCallback | null = null;

export function setLogCallback(cb: LogCallback | null) {
	logCallback = cb;
}

function ensureLogDir() {
	if (!fs.existsSync(LOG_DIR)) {
		fs.mkdirSync(LOG_DIR, { recursive: true });
	}
}

function formatMessage(level: string, message: string): string {
	const timestamp = new Date().toISOString();
	return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

function writeLog(level: string, ...args: unknown[]) {
	ensureLogDir();
	const message = args
		.map((arg) =>
			typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
		)
		.join(" ");
	const formatted = formatMessage(level, message);
	fs.appendFileSync(LOG_FILE, formatted + "\n");

	if (logCallback) {
		logCallback(level as LogLevel, message);
	}
}

export const logger = {
	info: (...args: unknown[]) => writeLog("info", ...args),
	warn: (...args: unknown[]) => writeLog("warn", ...args),
	error: (...args: unknown[]) => writeLog("error", ...args),
	debug: (...args: unknown[]) => writeLog("debug", ...args),
};