import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import z from "zod";
import type { ReplicateUtil } from "../class/replicate";
import {
	convertToWav,
	mergeAudioWithVideo,
	processAndMergeDubbedAudio,
} from "../convert/ffmpeg";
import { definePipeline } from "../types/pipeline";
import {
	mergeTranscriptionWithRef,
	splitAudioBySilence,
	splitAudioByTimeWithRef,
	type TranscriptionWithRef,
} from "../utils/audioSplit";
import {
	isQwenTTSSupported,
} from "../utils/language";
import { logger } from "../utils/logger";

const dubbingPipeline = definePipeline({
	name: "Dubbing Pipeline",
	description:
		"A pipeline to extract audio from video, separate speech, and prepare for dubbing.",
	allowTypes: ["mp4", "mkv", "avi"],
	inputType: z.object({
		inputFile: z.string().describe("Input video file"),
		outputFile: z.string().describe("Output audio file"),
		targetLanguage: z.string(),
		tmpDirectory: z.string(),
		sourceLanguage: z.string(),
		subtitleDirectory: z.string().optional(),
		backgroundVolume: z.number().min(0).max(1).default(0.25),
		dubbedVolume: z.number().min(0).max(1).default(1.0),
		ttsMode: z.enum(["auto", "qwen", "minimax"]).default("auto"),
		voiceClone: z.boolean().default(true),
		minSpeed: z.number().min(0.5).max(2.0).default(0.5),
		maxSpeed: z.number().min(0.5).max(2.0).default(2.0),
	}),
	outputType: z.object({
		outputFile: z.string().describe("Output file for the dubbed video"),
	}),
	steps: [
		{
			name: "Setup Environment",
			description:
				"Setup the environment for the pipeline, including checking for necessary tools and dependencies.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				return { extracted: true, inputFile: input.inputFile };
			},
		},
		{
			name: "Convert to WAV",
			description:
				"Convert the audio stream to WAV format for further processing.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				logger.debug(
					`Convert to WAV step: input.inputFile = ${input.inputFile} context.args.tmpDirectory = ${context.args.tmpDirectory}`,
				);
				const currentStepTmpDir = path.join(
					context.args.tmpDirectory as string,
					`step_${Object.keys(context.previousOutputs).length}`,
				);
				await mkdir(currentStepTmpDir, { recursive: true });
				logger.debug(
					`Calling convertToWav with: ${input.inputFile}, ${path.join(currentStepTmpDir, "output.wav")}`,
				);
				const outputFile = await convertToWav(
					input.inputFile,
					path.join(currentStepTmpDir, "output.wav"),
				);
				return { outputFile };
			},
		},
		{
			name: "Detect and Split by Silence",
			description:
				"Detect silent parts in the audio and split the audio into segments based on silence.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				return {
					outputFile: [
						(context.previousOutputs[1] as { outputFile: string })
							?.outputFile as string,
					],
				};
			},
		},
		{
			name: "Seperate Speech from Audio",
			description:
				"Use a speech separation model to isolate speech from the background audio.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				try {
					logger.debug(
						`Seperate Speech from Audio step: input.outputFile = ${input.outputFile}`,
					);
					const files = [];
					for (const file of ((
						context.previousOutputs[2] as { outputFile: string[] }
					)?.outputFile as string[]) || []) {
						logger.debug(`Processing file: ${file}`);
						files.push(file);
					}
					return { outputFile: files };
				} catch (error) {
					logger.error(
						"Error in Seperate Speech from Audio step:",
						inspect(error),
					);
					throw error;
				}
			},
		},
		{
			name: "Transcribe Audio",
			description: "Transcribe the separated speech audio to text for dubbing.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const replicate = context.args.replicateUtil as ReplicateUtil;
				const tmpDir = context.args.tmpDirectory as string;

				const allTranscriptions: TranscriptionWithRef[] = [];

				for (const file of ((
					context.previousOutputs[3] as { outputFile: string[] }
				)?.outputFile as string[]) || []) {
					logger.debug(`Transcribing file: ${file}`);
					const transcription = await replicate.transcribeAudio(
						file,
						context.args.sourceLanguage as string,
					);
					logger.debug(
						`Transcribe Audio step: transcription = `,
						inspect(transcription, { depth: null }),
					);
					const refAudioDir = path.join(
						tmpDir,
						`ref_audio`,
						path.basename(file, path.extname(file)),
					);
					await mkdir(refAudioDir, { recursive: true });
					const segments = await splitAudioByTimeWithRef({
						inputPath: file,
						refAudioPath: file,
						outputDir: refAudioDir,
						segments: transcription
							.map((item) =>
								(item.start !== undefined || item.start === null) &&
								(item.end !== undefined || item.end === null)
									? {
											start: item.start,
											end: item.end,
										}
									: null,
							)
							.filter((v): v is { start: number; end: number } => !!v),
					});
					allTranscriptions.push(
						...mergeTranscriptionWithRef(transcription, segments),
					);
				}

				logger.debug(
					"Transcribe Audio step: allTranscriptions = ",
					inspect(allTranscriptions, { depth: null }),
					"",
				);
				return { transcriptions: allTranscriptions };
			},
		},
		{
			name: "Translate Transcript",
			description:
				"Translate the transcribed text to the target language using AI.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const replicate = context.args.replicateUtil as ReplicateUtil;
				const transcriptions = (
					context.previousOutputs[4] as {
						transcriptions: TranscriptionWithRef[];
					}
				)?.transcriptions as TranscriptionWithRef[];

				if (!transcriptions || transcriptions.length === 0) {
					logger.warn("No transcriptions to translate");
					return { transcriptions: [] };
				}

				logger.debug(
					`Translating ${transcriptions.length} segments to ${context.args.targetLanguage}`,
				);

				const transcriptionOutputs = transcriptions;

				const translated = await replicate.translateTranscript(
					transcriptionOutputs,
					context.args.targetLanguage as string,
					context.args.sourceLanguage as string,
				);

				// Create a mapping of original index to translated text
				const result: TranscriptionWithRef[] = transcriptions.map(
					(t, index) => ({
						...t,
						originalText: t.text,
						text: translated[index]?.translated || t.text,
					}),
				);

				// Log if any segments were skipped by LLM
				const skippedCount = result.filter(t => !translated.find((tr, i) => i === result.indexOf(t) && tr.translated)).length;
				if (skippedCount > 0) {
					logger.warn(`${skippedCount} segments were potentially skipped or missing from translation output.`);
				}

				logger.debug(
					"Translate Transcript step: translated = ",
					inspect(result, { depth: null }),
					"",
				);
				return { transcriptions: result };
			},
		},
		{
			name: "Save Subtitles to SRT",
			description: "Save original and translated subtitles to SRT files.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const subtitleDirectory = context.args.subtitleDirectory as
					| string
					| undefined;

				if (!subtitleDirectory) {
					logger.debug("No subtitle directory provided, skipping SRT export");
					return { subtitleFiles: [] };
				}

				const transcriptions = (
					context.previousOutputs[5] as {
						transcriptions: TranscriptionWithRef[];
					}
				)?.transcriptions as TranscriptionWithRef[];

				if (!transcriptions || transcriptions.length === 0) {
					logger.warn("No transcriptions to save as subtitles");
					return { subtitleFiles: [] };
				}

				await mkdir(subtitleDirectory, { recursive: true });
				logger.debug(`Saving SRT files to: ${subtitleDirectory}`);

				const formatTime = (seconds: number): string => {
					const hrs = Math.floor(seconds / 3600);
					const mins = Math.floor((seconds % 3600) / 60);
					const secs = Math.floor(seconds % 60);
					const ms = Math.floor((seconds % 1) * 1000);
					return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
				};

				const generateSrtContent = (
					items: TranscriptionWithRef[],
					getText: (t: TranscriptionWithRef) => string,
				): string => {
					return items
						.map(
							(t, index) =>
								`${index + 1}\n${formatTime(t.start)} --> ${formatTime(t.end)}\n${getText(t)}\n`,
						)
						.join("\n");
				};

				const originalSrtPath = path.join(subtitleDirectory, "original.srt");
				const translatedSrtPath = path.join(
					subtitleDirectory,
					"translated.srt",
				);

				await writeFile(
					originalSrtPath,
					generateSrtContent(transcriptions, (t) => t.originalText || t.text),
				);
				logger.debug(`Saved original subtitles to: ${originalSrtPath}`);

				await writeFile(
					translatedSrtPath,
					generateSrtContent(transcriptions, (t) => t.text),
				);
				logger.debug(`Saved translated subtitles to: ${translatedSrtPath}`);

				return {
					subtitleFiles: [originalSrtPath, translatedSrtPath],
				};
			},
		},
		{
			name: "Generate Dubbed Audio",
			description:
				"Generate dubbed audio using TTS for each translated segment.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const replicate = context.args.replicateUtil as ReplicateUtil;
				const transcriptions = (
					context.previousOutputs[5] as {
						transcriptions: TranscriptionWithRef[];
					}
				)?.transcriptions as TranscriptionWithRef[];

				if (!transcriptions || transcriptions.length === 0) {
					logger.warn("No transcriptions to generate dubbed audio");
					return { audioFiles: [] };
				}

				const validRefAudios = transcriptions
					.map((t) => t.ref_audio)
					.filter((ref) => ref && ref.trim() !== "");
				const firstValidRefAudio = validRefAudios.find(() => true) ?? undefined;
				if (firstValidRefAudio) {
					logger.debug(
						`Using fallback reference audio: ${firstValidRefAudio} for ${transcriptions.length - validRefAudios.length} segments`,
					);
				}

				const targetLanguage = context.args.targetLanguage as string;
				const requiresRefAudio =
					input.voiceClone && !isQwenTTSSupported(targetLanguage as any);

				if (requiresRefAudio && !firstValidRefAudio) {
					throw new Error(
						`Language "${targetLanguage}" requires reference audio for voice cloning. Please provide reference audio or use a supported language (or disable cloning).`,
					);
				}

				const tmpDir = context.args.tmpDirectory as string;
				const dubbedDir = path.join(tmpDir, "dubbed_audio");
				await mkdir(dubbedDir, { recursive: true });

				const audioFiles: {
					path: string;
					startTime: number;
					originalDuration?: number;
				}[] = [];

				// Track which segments have been "consumed" by sharing
				const consumedIndices = new Set<number>();

				for (let i = 0; i < transcriptions.length; i++) {
					const t = transcriptions[i];
					if (!t || consumedIndices.has(i)) continue;

					const translation = t.text;
					const isMissing = !translation || translation === t.originalText;

					if (isMissing) {
						// This segment was skipped or untranslated.
						// Duration sharing logic:
						let sharedWithIdx = -1;

						// Try sharing with previous neighbor if it's "short" (< 1.5s)
						if (i > 0) {
							const prevSeg = audioFiles[audioFiles.length - 1];
							if (prevSeg && prevSeg.originalDuration && prevSeg.originalDuration < 1.5) {
								sharedWithIdx = i - 1;
							}
						}

						// If not shared with previous, try sharing with next neighbor if it's "short" (< 1.5s)
						if (sharedWithIdx === -1 && i < transcriptions.length - 1) {
							const nextT = transcriptions[i + 1];
							if (nextT && (nextT.end - nextT.start) < 1.5) {
								sharedWithIdx = i + 1;
							}
						}

						if (sharedWithIdx !== -1) {
							const extraDuration = t.end - t.start;
							if (sharedWithIdx < i) {
								// Shared with previous: already in audioFiles
								const prev = audioFiles[audioFiles.length - 1];
								if (prev) {
									logger.info(`Sharing duration of skipped segment ${i} (${extraDuration.toFixed(2)}s) with previous segment ${sharedWithIdx}`);
									prev.originalDuration = (prev.originalDuration || 0) + extraDuration;
								}
								continue;
							} else {
								// Shared with next: will be handled in next iteration or by modifying transcriptions[i+1]
								const next = transcriptions[i + 1];
								if (next) {
									logger.info(`Sharing duration of skipped segment ${i} (${extraDuration.toFixed(2)}s) with next segment ${sharedWithIdx}`);
									next.start = t.start; // Extend next segment to start where this one started
									// originalDuration will be calculated naturally as next.end - next.start
								}
								continue;
							}
						}

						// If not shared, it remains as silence (gap) in the final merge.
						logger.info(`Segment ${i} remains as silence (skipped by LLM and no suitable neighbor for sharing).`);
						continue;
					}

					const refAudioUrl =
						t.ref_audio && t.ref_audio.trim() !== ""
							? t.ref_audio
							: firstValidRefAudio;

					logger.debug(
						`Generating dubbed audio for segment ${i + 1}/${transcriptions.length}`,
					);

					const audioBuffer = await replicate.generateVoice({
						text: t.text,
						ref_audioUrl: refAudioUrl ?? undefined,
						textInOrginalLanguage: t.text,
						language: targetLanguage,
						ttsProvider: input.ttsMode,
						voiceClone: input.voiceClone,
					});

					const outputPath = path.join(
						dubbedDir,
						`dubbed_${String(i).padStart(4, "0")}.mp3`,
					);
					await writeFile(outputPath, audioBuffer);

					audioFiles.push({
						path: outputPath,
						startTime: t.start,
						originalDuration: t.end - t.start,
					});
				}

				logger.debug(`Generated ${audioFiles.length} dubbed audio segments`);
				return { audioFiles };
			},
		},
		{
			name: "Merge Segments to Single Audio",
			description:
				"Mix all generated TTS audio segments with original background audio.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const audioFiles = (
					context.previousOutputs[7] as {
						audioFiles: {
							path: string;
							startTime: number;
							originalDuration?: number;
						}[];
					}
				)?.audioFiles as {
					path: string;
					startTime: number;
					originalDuration?: number;
				}[];

				if (!audioFiles || audioFiles.length === 0) {
					logger.warn("No audio files to merge");
					return { outputFile: "" };
				}

				const tmpDir = context.args.tmpDirectory as string;
				const outputPath = path.join(tmpDir, "dubbed_full.mp3");

				// Get original audio from Step 2 (Convert to WAV output)
				const originalAudioPath = (context.previousOutputs[1] as {
					outputFile: string;
				})?.outputFile as string;

				if (!originalAudioPath) {
					throw new Error("Original audio path not found in previous outputs");
				}

				const mergedPath = await processAndMergeDubbedAudio(
					audioFiles,
					originalAudioPath,
					outputPath,
					tmpDir,
					context.args.backgroundVolume as number,
					context.args.dubbedVolume as number,
					input.minSpeed,
					input.maxSpeed,
				);

				logger.debug(`Mixed audio to: ${mergedPath}`);
				return { outputFile: mergedPath };
			},
		},
		{
			name: "Merge Audio with Video",
			description: "Combine the dubbed audio with the original video.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const audioPath = (context.previousOutputs[8] as { outputFile: string })
					?.outputFile as string;

				if (!audioPath) {
					throw new Error("No dubbed audio file available");
				}

				const outputPath = input.outputFile;

				const mergedPath = await mergeAudioWithVideo(
					input.inputFile,
					audioPath,
					outputPath,
				);

				logger.debug(`Merged video saved to: ${mergedPath}`);
				return { outputFile: mergedPath };
			},
		},
	],
});


export default dubbingPipeline;
