import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs/promises";
import * as path from "path";
import type { TranscriptionOutput } from "../class/replicate";
import { logger } from "../utils/logger";

export interface SilenceSegment {
	start: number;
	end: number;
	duration: number;
}

export interface SplitAudioOptions {
	inputPath: string;
	outputDir: string;
	silenceThreshold?: number;
	minSilenceDuration?: number;
	minSegmentDuration?: number;
}

export async function detectSilence(
	audioPath: string,
	silenceThreshold: number = -40,
	minSilenceDuration: number = 0.5,
): Promise<SilenceSegment[]> {
	logger.debug(`detectSilence called with audioPath: ${audioPath}`);

	return new Promise<SilenceSegment[]>((resolve, reject) => {
		const segments: SilenceSegment[] = [];

		ffmpeg(audioPath)
			.audioFilters(
				`silencedetect=noise=${silenceThreshold}dB:d=${minSilenceDuration}`,
			)
			.outputOptions(["-f", "null"])
			.on("stderr", (stderr: string) => {
				const startMatch = stderr.match(/silence_start: ([\d.]+)/);
				const endMatch = stderr.match(/silence_end: ([\d.]+)/);

				if (startMatch) {
					const start = parseFloat(startMatch[1] ?? "0");
					segments.push({ start, end: 0, duration: 0 });
				}

				if (endMatch) {
					const end = parseFloat(endMatch[1] ?? "0");
					const lastSegment = segments[segments.length - 1];
					if (lastSegment && lastSegment.end === 0) {
						lastSegment.end = end;
						lastSegment.duration = end - lastSegment.start;
					}
				}
			})
			.on("end", () => {
				logger.info(`Detected ${segments.length} silence segments`);
				resolve(segments);
			})
			.on("error", (err: Error) => {
				logger.error(`Error detecting silence: ${err.message}`);
				reject(err);
			})
			.output("-") // Use stdout as output for null format
			.run();
	});
}

export async function splitAudioBySilence(
	options: SplitAudioOptions,
): Promise<string[]> {
	const {
		inputPath,
		outputDir,
		silenceThreshold = -40,
		minSilenceDuration = 0.5,
		minSegmentDuration = 0.3,
	} = options;

	logger.debug(
		`splitAudioBySilence called with inputPath: ${inputPath}, outputDir: ${outputDir}`,
	);

	await fs.mkdir(outputDir, { recursive: true });

	const silenceSegments = await detectSilence(
		inputPath,
		silenceThreshold,
		minSilenceDuration,
	);

	const outputFiles: string[] = [];
	const baseName = path.basename(inputPath, path.extname(inputPath));

	if (silenceSegments.length === 0) {
		const outputPath = path.join(outputDir, `${baseName}_part_1.mp3`);
		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.on("error", (err: Error) => reject(err))
				.on("end", () => resolve())
				.save(outputPath);
		});
		outputFiles.push(outputPath);
		return outputFiles;
	}

	let previousEnd = 0;
	let partIndex = 1;

	for (const segment of silenceSegments) {
		const segmentDuration = segment.start - previousEnd;

		if (segmentDuration >= minSegmentDuration) {
			const outputPath = path.join(
				outputDir,
				`${baseName}_part_${partIndex}.mp3`,
			);

			await new Promise<void>((resolve, reject) => {
				ffmpeg(inputPath)
					.setStartTime(previousEnd)
					.setDuration(segmentDuration)
					.on("error", (err: Error) => reject(err))
					.on("end", () => resolve())
					.save(outputPath);
			});

			outputFiles.push(outputPath);
			partIndex++;
		}

		previousEnd = segment.end;
	}

	const remainingDuration = (await getAudioDuration(inputPath)) - previousEnd;
	if (remainingDuration >= minSegmentDuration) {
		const outputPath = path.join(
			outputDir,
			`${baseName}_part_${partIndex}.mp3`,
		);

		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.setStartTime(previousEnd)
				.on("error", (err: Error) => reject(err))
				.on("end", () => resolve())
				.save(outputPath);
		});

		outputFiles.push(outputPath);
	}

	logger.info(`Split audio into ${outputFiles.length} segments`);
	return outputFiles;
}

function getAudioDuration(audioPath: string): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		ffmpeg.ffprobe(
			audioPath,
			(err: Error | null, metadata: ffmpeg.FfprobeData) => {
				if (err) {
					reject(err);
				} else {
					resolve(metadata.format.duration ?? 0);
				}
			},
		);
	});
}

export interface TimeSegment {
	start: number;
	end: number;
}

export interface SplitAudioByTimeOptions {
	inputPath: string;
	outputDir: string;
	segments: TimeSegment[];
	outputFormat?: "mp3" | "wav" | "m4a";
}

export interface AudioSegmentWithRef {
	// this is the segment of audio
	audioPath: string;
	// this is the orginal audio path
	refAudioPath: string;
	startTime: number;
	endTime: number;
	index: number;
}

export interface SplitAudioByTimeWithRefOptions {
	inputPath: string;
	refAudioPath: string;
	outputDir: string;
	segments: TimeSegment[];
	outputFormat?: "mp3" | "wav" | "m4a";
}

export async function splitAudioByTime(
	options: SplitAudioByTimeOptions,
): Promise<string[]> {
	const { inputPath, outputDir, segments, outputFormat = "mp3" } = options;

	logger.debug(
		`splitAudioByTime called with inputPath: ${inputPath}, segments: ${segments.length}`,
	);

	await fs.mkdir(outputDir, { recursive: true });

	const outputFiles: string[] = [];
	const baseName = path.basename(inputPath, path.extname(inputPath));

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]!;
		const start = segment.start;
		const end = segment.end;
		const duration = end - start;

		if (duration <= 0) {
			logger.warn(`Invalid segment ${i}: start ${start} >= end ${end}`);
			continue;
		}

		const outputPath = path.join(
			outputDir,
			`${baseName}_segment_${i + 1}.${outputFormat}`,
		);

		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.setStartTime(start)
				.setDuration(duration)
				.on("error", (err: Error) => {
					logger.error(`Error splitting segment ${i}: ${err.message}`);
					reject(err);
				})
				.on("end", () => {
					logger.debug(`Created segment ${i + 1}: ${outputPath}`);
					resolve();
				})
				.save(outputPath);
		});

		outputFiles.push(outputPath);
	}

	logger.info(`Split audio into ${outputFiles.length} time-based segments`);
	return outputFiles;
}

export async function splitAudioAtIntervals(
	inputPath: string,
	outputDir: string,
	intervalSeconds: number,
	outputFormat: "mp3" | "wav" | "m4a" = "mp3",
): Promise<string[]> {
	logger.debug(
		`splitAudioAtIntervals called with inputPath: ${inputPath}, interval: ${intervalSeconds}s`,
	);

	const totalDuration = await getAudioDuration(inputPath);
	const segments: TimeSegment[] = [];

	for (let start = 0; start < totalDuration; start += intervalSeconds) {
		const end = Math.min(start + intervalSeconds, totalDuration);
		segments.push({ start, end });
	}

	return splitAudioByTime({ inputPath, outputDir, segments, outputFormat });
}

export async function splitAudioByTimeWithRef(
	options: SplitAudioByTimeWithRefOptions,
): Promise<AudioSegmentWithRef[]> {
	const {
		inputPath,
		refAudioPath,
		outputDir,
		segments,
		outputFormat = "mp3",
	} = options;

	logger.debug(
		`splitAudioByTimeWithRef called with inputPath: ${inputPath}, refAudioPath: ${refAudioPath}, segments: ${segments.length}`,
	);

	await fs.mkdir(outputDir, { recursive: true });

	const baseName = path.basename(inputPath, path.extname(inputPath));

	const results: AudioSegmentWithRef[] = [];

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]!;
		const start = segment.start;
		const end = segment.end;
		const duration = end - start;

		if (duration <= 0) {
			logger.warn(`Invalid segment ${i}: start ${start} >= end ${end}`);
			continue;
		}

		const outputPath = path.join(
			outputDir,
			`${baseName}_segment_${i + 1}.${outputFormat}`,
		);

		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.setStartTime(start)
				.setDuration(duration)
				.on("error", (err: Error) => {
					logger.error(`Error splitting segment ${i}: ${err.message}`);
					reject(err);
				})
				.on("end", () => {
					logger.debug(`Created segment ${i + 1}: ${outputPath}`);
					resolve();
				})
				.save(outputPath);
		});

		results.push({
			audioPath: outputPath,
			refAudioPath: refAudioPath,
			startTime: start,
			endTime: end,
			index: i,
		});
	}

	logger.info(`Split audio into ${results.length} segments with ref audio`);
	return results;
}

export interface TranscriptionWithRef extends TranscriptionOutput {
	/**
	 * this is the original audio path
	 */
	ref_audio: string;
	/**
	 * this is the path of the splitted audio segment that corresponds to this transcription
	 */
	audio_file: string;
}

export function mergeTranscriptionWithRef(
	transcriptions: Array<TranscriptionOutput>,
	audioSegments: AudioSegmentWithRef[],
): TranscriptionWithRef[] {
	const result: TranscriptionWithRef[] = [];

	for (const transcription of transcriptions) {
		const matchingSegment = audioSegments.find(
			(seg) => Math.abs(seg.startTime - transcription.start) < 0.5,
		);

		if (matchingSegment) {
			result.push({
				...transcription,
				ref_audio: matchingSegment.refAudioPath,
				audio_file: matchingSegment.audioPath,
			});
		} else {
			logger.warn(
				`No matching segment found for transcription at ${transcription.start}s, using default ref audio`,
			);
			result.push({
				...transcription,
				ref_audio: audioSegments[0]?.refAudioPath ?? "",
				audio_file: audioSegments[0]?.audioPath ?? "",
			});
		}
	}

	return result;
}
