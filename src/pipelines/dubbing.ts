import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import z from "zod";
import type { ReplicateUtil } from "../class/replicate";
import { convertToWav } from "../convert/ffmpeg";
import { definePipeline } from "../types/pipeline";
import {
	mergeTranscriptionWithRef,
	splitAudioBySilence,
	splitAudioByTimeWithRef,
	type TranscriptionWithRef,
} from "../utils/audioSplit";
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
	}),
	outputType: z.object({
		outputFile: z.string().describe("Output file for processed audio"),
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
				logger.debug(
					`Detect and Split by Silence step: input.outputFile = ${inspect(context.previousOutputs[1])} context.args.tmpDirectory = ${context.args.tmpDirectory}`,
				);
				const currentStepTmpDir = path.join(
					context.args.tmpDirectory as string,
					`step_${Object.keys(context.previousOutputs).length}`,
				);
				await mkdir(currentStepTmpDir, { recursive: true });
				const outputFiles = await splitAudioBySilence({
					inputPath: (context.previousOutputs[1] as { outputFile: string })
						?.outputFile as string,
					outputDir: currentStepTmpDir,
					silenceThreshold: -40,
					minSilenceDuration: 0.5,
					minSegmentDuration: 0.3,
				});
				logger.debug(
					`Detect and Split by Silence step: outputFiles = ${outputFiles}`,
				);
				return { outputFile: outputFiles };
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
					// const replicate = context.args.replicateUtil as ReplicateUtil;
					const files = [];
					for (const file of ((
						context.previousOutputs[2] as { outputFile: string[] }
					)?.outputFile as string[]) || []) {
						logger.debug(`Processing file: ${file}`);
						// const separatedAudioFile = await replicate.isolationSpeechFromAudio(
						// 	input.outputFile,
						// );
						// const outputFiles = [];
						// const currentStepTmpDir = path.join(
						// 	context.args.tmpDirectory as string,
						// 	`step_${Object.keys(context.previousOutputs).length}`,
						// );
						// await mkdir(currentStepTmpDir, { recursive: true });
						// for (const [index, item] of Object.entries(separatedAudioFile)) {
						// 	const outputPath = path.join(
						// 		currentStepTmpDir,
						// 		`output_${index}.wav`,
						// 	);
						// 	await writeFile(outputPath, item);
						// 	outputFiles.push(outputPath);
						// }
						// logger.debug(
						// 	`Seperate Speech from Audio step: outputFiles = `,
						// 	inspect(separatedAudioFile, { depth: null }),
						// );
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
						segments: transcription.map((item) => ({
							start: item.start,
							end: item.end,
						})),
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

				const result: TranscriptionWithRef[] = transcriptions.map(
					(t, index) => ({
						...t,
						text: translated[index]?.text || t.text,
					}),
				);

				logger.debug(
					"Translate Transcript step: translated = ",
					inspect(result, { depth: null }),
					"",
				);
				return { transcriptions: result };
			},
		},
	],
});

export default dubbingPipeline;
