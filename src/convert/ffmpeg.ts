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
export async function processAndMergeDubbedAudio(
	ttsSegments: {
		path: string;
		startTime: number;
		originalDuration?: number;
	}[],
	originalAudioPath: string,
	outputPath: string,
	tmpDir: string,
	backgroundVolume: number = 0.25,
	dubbedVolume: number = 1.0,
	minSpeed: number = 0.5,
	maxSpeed: number = 2.0,
): Promise<string> {
	logger.debug(
		`processAndMergeDubbedAudio: mixing ${ttsSegments.length} TTS segments with original audio (minSpeed: ${minSpeed}, maxSpeed: ${maxSpeed})`,
	);

	if (ttsSegments.length === 0) {
		throw new Error("No TTS segments to mix");
	}

	const originalTotalDuration = await getAudioDuration(originalAudioPath);
	logger.debug(`Original audio duration: ${originalTotalDuration}s`);

	const sortedSegments = [...ttsSegments].sort(
		(a, b) => a.startTime - b.startTime,
	);

	const adjustedSegmentPaths: {
		path: string;
		startTime: number;
		duration: number;
	}[] = [];
	const tempFilesToClean: string[] = [];

	const chunkSize = 5;
	for (let i = 0; i < sortedSegments.length; i += chunkSize) {
		const chunk = sortedSegments.slice(i, i + chunkSize);
		await Promise.all(
			chunk.map(async (seg, chunkIdx) => {
				const index = i + chunkIdx;
				const dubbedDuration = await getAudioDuration(seg.path);
				const originalDuration = seg.originalDuration ?? dubbedDuration;

				let speedFactor = 1.0;
				if (
					originalDuration > 0 &&
					Math.abs(dubbedDuration - originalDuration) > 0.01
				) {
					speedFactor = dubbedDuration / originalDuration;
				}

				// Clamp speed factor
				if (speedFactor > maxSpeed) {
					logger.warn(
						`Segment ${index} speed factor (${speedFactor.toFixed(3)}) exceeds maxSpeed (${maxSpeed}). Clamping.`,
					);
					speedFactor = maxSpeed;
				} else if (speedFactor < minSpeed) {
					logger.warn(
						`Segment ${index} speed factor (${speedFactor.toFixed(3)}) below minSpeed (${minSpeed}). Clamping.`,
					);
					speedFactor = minSpeed;
				}

				const targetDuration = dubbedDuration / speedFactor;

				const filterArr: string[] = [];

				if (Math.abs(speedFactor - 1.0) > 0.01) {
					let factor = speedFactor;
					while (factor > 2.0) {
						filterArr.push(`atempo=2.0`);
						factor /= 2.0;
					}
					while (factor < 0.5) {
						filterArr.push(`atempo=0.5`);
						factor /= 0.5;
					}
					filterArr.push(`atempo=${factor.toFixed(3)}`);
				}

				const fadeDuration = 0.005;
				filterArr.push(`afade=t=in:st=0:d=${fadeDuration}`);
				if (targetDuration > fadeDuration * 2) {
					const fadeOutStart = targetDuration - fadeDuration;
					filterArr.push(`afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`);
				}

				filterArr.push(`aformat=channel_layouts=stereo:sample_rates=44100`);
				const filterStr = filterArr.join(",");

				const adjustedPath = path.join(
					tmpDir,
					`adjusted_${String(index).padStart(4, "0")}.wav`,
				);

				await new Promise<void>((resolve, reject) => {
					ffmpeg(seg.path)
						.outputOptions([
							"-filter_complex",
							`[0:a]${filterStr}[out]`,
							"-map",
							"[out]",
							"-ar",
							"44100",
							"-ac",
							"2",
							"-c:a",
							"pcm_s16le",
						])
						.on("error", (err) => {
							logger.error(
								`Error adjusting segment ${index}: ${err.message}`,
							);
							reject(err);
						})
						.on("end", () => resolve())
						.save(adjustedPath);
				});

				adjustedSegmentPaths.push({
					path: adjustedPath,
					startTime: seg.startTime,
					duration: targetDuration,
				});
				tempFilesToClean.push(adjustedPath);
			}),
		);
	}

	adjustedSegmentPaths.sort((a, b) => a.startTime - b.startTime);

	const concatListPath = path.join(tmpDir, "concat.txt");
	const silenceFilesMap = new Map<number, string>();

	let cursor = 0;
	const concatLines: string[] = [];

	const getSilenceFile = async (gapSeconds: number): Promise<string> => {
		const gap = Number(gapSeconds.toFixed(3));
		if (silenceFilesMap.has(gap)) return silenceFilesMap.get(gap)!;

		const silencePath = path.join(tmpDir, `silence_${gap}.wav`);
		const { exec } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const execAsync = promisify(exec);

		try {
			await execAsync(`ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -t ${gap} -c:a pcm_s16le "${silencePath}"`);
		} catch (err: any) {
			logger.error(`Error creating silence file: ${err.message}`);
			throw err;
		}

		silenceFilesMap.set(gap, silencePath);
		tempFilesToClean.push(silencePath);
		return silencePath;
	};

	for (let i = 0; i < adjustedSegmentPaths.length; i++) {
		const seg = adjustedSegmentPaths[i];
		if (!seg) continue;
		let safeStartTime = seg.startTime;
		if (safeStartTime < cursor) {
			logger.warn(
				`Segment ${i} overlaps with previous! Adjusting start time from ${seg.startTime} to ${cursor}`,
			);
			safeStartTime = cursor;
		}

		if (safeStartTime > cursor + 0.001) {
			const gap = safeStartTime - cursor;
			const silencePath = await getSilenceFile(gap);
			concatLines.push(`file '${silencePath.replace(/\\/g, "/")}'`);
			cursor = safeStartTime;
		}

		concatLines.push(`file '${seg.path.replace(/\\/g, "/")}'`);
		cursor += seg.duration;
	}

	const finalGap = originalTotalDuration - cursor;
	if (finalGap > 0.001) {
		const finalSilencePath = await getSilenceFile(finalGap);
		concatLines.push(`file '${finalSilencePath.replace(/\\/g, "/")}'`);
	}

	await fs.writeFile(concatListPath, concatLines.join("\n"));
	tempFilesToClean.push(concatListPath);

	const dubbedTrackPath = path.join(tmpDir, "dubbed_track.wav");
	await new Promise<void>((resolve, reject) => {
		ffmpeg()
			.input(concatListPath)
			.inputOptions(["-f", "concat", "-safe", "0"])
			.outputOptions(["-c:a", "pcm_s16le"])
			.on("error", (err) => {
				logger.error(`Error concatenating dubbed track: ${err.message}`);
				reject(err);
			})
			.on("end", () => resolve())
			.save(dubbedTrackPath);
	});
	tempFilesToClean.push(dubbedTrackPath);

	await new Promise<void>((resolve, reject) => {
		ffmpeg()
			.input(originalAudioPath)
			.input(dubbedTrackPath)
			.outputOptions([
				"-filter_complex",
				`[0:a]volume=${backgroundVolume}[orig];[1:a]volume=${dubbedVolume}[dub];[orig][dub]amix=inputs=2:duration=longest:dropout_transition=0[out]`,
				"-map",
				"[out]",
				"-c:a",
				"libmp3lame",
				"-q:a",
				"2",
			])
			.on("error", (err) => {
				logger.error(`Error mixing final tracks: ${err.message}`);
				reject(err);
			})
			.on("end", () => resolve())
			.save(outputPath);
	});

	for (const file of tempFilesToClean) {
		await fs.unlink(file).catch(() => {});
	}

	logger.info(`Final dubbed audio saved to: ${outputPath}`);
	return outputPath;
}
