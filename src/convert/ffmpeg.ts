import * as fs from "node:fs/promises";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import { logger } from "../utils/logger";

export async function convertToWav(inputPath: string, outputPath: string) {
	logger.debug(
		`convertToWav called with inputPath: ${inputPath}, outputPath: ${outputPath}`,
	);

	if (!inputPath) {
		logger.error(`convertToWav: inputPath is undefined or empty!`);
		throw new Error(`inputPath is undefined or empty`);
	}

	return new Promise<string>((resolve, reject) => {
		logger.debug(`Starting ffmpeg with input: ${inputPath}`);
		ffmpeg(inputPath)
			.toFormat("mp3")
			.on("start", (commandLine) => {
				logger.info(`Spawned FFmpeg with command: ${commandLine}`);
			})
			.on("progress", (progress) => {
				logger.info(`Processing: ${progress.percent}% done`);
			})
			.on("error", (err) => {
				logger.error(`An error occurred: ${err.message}`);
				reject(err);
			})
			.on("end", () => {
				logger.info(`Finished processing! Audio saved to: ${outputPath}`);
				resolve(outputPath);
			})
			.save(outputPath);
	});
}

export interface AudioSegmentInput {
	path: string;
	startTime: number;
}

export async function mergeAudioSegments(
	audioFiles: AudioSegmentInput[],
	outputPath: string,
): Promise<string> {
	logger.debug(`mergeAudioSegments called with ${audioFiles.length} files`);

	if (audioFiles.length === 0) {
		throw new Error("No audio files to merge");
	}

	if (audioFiles.length === 1 && audioFiles[0]) {
		await fs.copyFile(audioFiles[0]?.path, outputPath);
		return outputPath;
	}

	const tempListPath = `${outputPath}.txt`;
	const listContent = audioFiles
		.sort((a, b) => a.startTime - b.startTime)
		.map((f) => `file '${f.path}'`)
		.join("\n");
	await fs.writeFile(tempListPath, listContent);

	return new Promise<string>((resolve, reject) => {
		ffmpeg()
			.input(tempListPath)
			.inputOptions(["-f", "concat", "-safe", "0"])
			.outputOptions(["-c", "copy"])
			.on("error", (err) => {
				logger.error(`Error merging audio segments: ${err.message}`);
				reject(err);
			})
			.on("end", async () => {
				try {
					await fs.unlink(tempListPath);
				} catch {
					// ignore cleanup error
				}
				logger.info(`Merged audio segments saved to: ${outputPath}`);
				resolve(outputPath);
			})
			.save(outputPath);
	});
}

export async function mergeAudioWithVideo(
	videoPath: string,
	audioPath: string,
	outputPath: string,
): Promise<string> {
	logger.debug(
		`mergeAudioWithVideo called with video: ${videoPath}, audio: ${audioPath}`,
	);

	return new Promise<string>((resolve, reject) => {
		ffmpeg(videoPath)
			.input(audioPath)
			.outputOptions([
				"-c:v",
				"copy",
				"-map",
				"0:v:0",
				"-map",
				"1:a:0",
				"-shortest",
			])
			.on("error", (err) => {
				logger.error(`Error merging audio with video: ${err.message}`);
				reject(err);
			})
			.on("end", () => {
				logger.info(`Merged audio with video saved to: ${outputPath}`);
				resolve(outputPath);
			})
			.save(outputPath);
	});
}

export async function getAudioDuration(filePath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}
			const duration = metadata.format?.duration || 0;
			resolve(duration);
		});
	});
}

/**
 * Adjusts audio speed to match target duration using atempo filter.
 * Speed factor = originalDuration / dubbedDuration.
 * Returns path to adjusted audio file.
 */
export async function adjustAudioSpeed(
	audioPath: string,
	outputPath: string,
	speedFactor: number,
): Promise<string> {
	logger.debug(
		`adjustAudioSpeed: ${audioPath} -> ${outputPath}, factor: ${speedFactor}`,
	);

	// Clamp speed factor to atempo supported range (0.5 to 2.0)
	// For extreme differences, chain multiple atempo filters
	const clampedFactor = Math.max(0.5, Math.min(2.0, speedFactor));

	return new Promise<string>((resolve, reject) => {
		ffmpeg(audioPath)
			.outputOptions(["-filter:a", `atempo=${clampedFactor.toFixed(3)}`])
			.on("error", (err) => {
				logger.error(`Error adjusting audio speed: ${err.message}`);
				reject(err);
			})
			.on("end", () => {
				logger.info(`Speed-adjusted audio saved to: ${outputPath}`);
				resolve(outputPath);
			})
			.save(outputPath);
	});
}

/**
 * Merges audio segments with precise timing control.
 * For each segment, applies speed adjustment to match original duration (if originalDuration provided).
 * Uses gaps between startTimes to insert silence, maintaining original video timing.
 */
export async function mergeAudioSegmentsWithTiming(
	audioFiles: {
		path: string;
		startTime: number;
		originalDuration?: number;
	}[],
	outputPath: string,
	tmpDir: string,
): Promise<string> {
	logger.debug(
		`mergeAudioSegmentsWithTiming: merging ${audioFiles.length} segments with timing alignment`,
	);

	if (audioFiles.length === 0) {
		throw new Error("No audio files to merge");
	}

	// Sort by startTime
	const sortedFiles = [...audioFiles].sort((a, b) => a.startTime - b.startTime);

	// If only one file, optionally adjust speed, then copy
	if (sortedFiles.length === 1) {
		const file = sortedFiles[0];
		if (!file?.path) {
			throw new Error("Audio file path is undefined");
		}
		if (file.originalDuration) {
			const dubbedDuration = await getAudioDuration(file.path);
			const speedFactor = file.originalDuration / dubbedDuration;
			if (Math.abs(speedFactor - 1.0) > 0.01) {
				const adjustedPath = path.join(tmpDir, "adjusted_0.mp3");
				return await adjustAudioSpeed(file.path, adjustedPath, speedFactor);
			}
		}
		await fs.copyFile(file.path, outputPath);
		return outputPath;
	}

	// Process each segment: adjust speed to match original duration, track gaps
	const adjustedFiles: {
		path: string;
		startTime: number;
		originalDuration?: number;
	}[] = [];
	const tempDir = path.dirname(outputPath);

	for (let i = 0; i < sortedFiles.length; i++) {
		const file = sortedFiles[i];
		if (!file?.path) {
			throw new Error(`Audio file path is undefined for segment ${i}`);
		}
		const originalDuration = file.originalDuration ?? 0;

		// Get actual duration of dubbed audio
		const dubbedDuration = await getAudioDuration(file.path);

		if (
			originalDuration > 0 &&
			Math.abs(dubbedDuration - originalDuration) > 0.01
		) {
			// Speed adjustment needed
			const speedFactor = originalDuration / dubbedDuration;
			const adjustedPath = path.join(
				tempDir,
				`adjusted_${String(i).padStart(4, "0")}.mp3`,
			);
			await adjustAudioSpeed(file.path, adjustedPath, speedFactor);
			adjustedFiles.push({
				path: adjustedPath,
				startTime: file.startTime,
				originalDuration,
			});
		} else {
			// No adjustment needed
			adjustedFiles.push({
				path: file.path,
				startTime: file.startTime,
				originalDuration,
			});
		}
	}

	// Build concat list with silence gaps
	const silenceFiles: string[] = [];
	for (let i = 0; i < adjustedFiles.length; i++) {
		const current = adjustedFiles[i];
		if (!current?.path) {
			throw new Error(`Adjusted file path is undefined for segment ${i}`);
		}
		const next = adjustedFiles[i + 1];
		if (!next?.path) {
			throw new Error(`Next file path is undefined for segment ${i + 1}`);
		}

		// Add current segment
		silenceFiles.push(`file '${current.path}'`);

		// If there's a gap to next segment, insert silence
		if (next && next.startTime > current.startTime) {
			const currentEnd = current.startTime + (current.originalDuration || 0);
			const gap = next.startTime - currentEnd;

			if (gap > 0.05) {
				// Create silence file for gap (in seconds)
				const silencePath = path.join(
					tempDir,
					`silence_${String(i).padStart(4, "0")}.mp3`,
				);
				await createSilenceFile(silencePath, gap);
				silenceFiles.push(`file '${silencePath}'`);
			}
		}
	}

	// Write concat list
	const listPath = `${outputPath}.list.txt`;
	await fs.writeFile(listPath, silenceFiles.join("\n"));

	return new Promise<string>((resolve, reject) => {
		ffmpeg()
			.input(listPath)
			.inputOptions(["-f", "concat", "-safe", "0"])
			.outputOptions(["-c", "copy"])
			.on("error", (err) => {
				logger.error(`Error merging with timing: ${err.message}`);
				reject(err);
			})
			.on("end", async () => {
				try {
					await fs.unlink(listPath);
					// Cleanup temp silence/adjusted files
					for (const line of silenceFiles) {
						const filePath = line.replace("file '", "").replace("'", "");
						if (
							filePath.includes("adjusted_") ||
							filePath.includes("silence_")
						) {
							await fs.unlink(filePath).catch(() => {});
						}
					}
				} catch {
					// ignore cleanup errors
				}
				logger.info(`Merged audio with timing saved to: ${outputPath}`);
				resolve(outputPath);
			})
			.save(outputPath);
	});
}

export async function createSilenceFile(
	outputPath: string,
	durationSeconds: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg()
			.input("anullsrc=channel_layout=stereo:sample_rate=44100")
			.inputOptions(["-f", "lavfi"])
			.setDuration(durationSeconds)
			.on("error", (err) => {
				logger.error(`Error creating silence file: ${err.message}`);
				reject(err);
			})
			.on("end", () => resolve())
			.save(outputPath);
	});
}
