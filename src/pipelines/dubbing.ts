import z from "zod";
import { definePipeline } from "../types/pipeline";
import { convertToWav } from "../convert/ffmpeg";
import type { ReplicateUtil } from "../class/replicate";

const dubbingPipeline = definePipeline({
	name: "Dubbing Pipeline",
	description:
		"A pipeline to extract audio from video, separate speech, and prepare for dubbing.",
	allowTypes: ["mp4", "mkv", "avi"],
	inputType: z.object({
		inputFile: z.string().describe("Input video file"),
		outputFile: z.string().describe("Output audio file"),
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
				const outputFile = await convertToWav(
					input.inputFile,
					input.outputFile,
				);
				return { outputFile };
			},
		},
		{
			name: "Seperate Speech from Audio",
			description:
				"Use a speech separation model to isolate speech from the background audio.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const output = context.args.replicateUtil as ReplicateUtil;
				const separatedAudioFile = await output.isolationSpeechFromAudio(
					input.outputFile,
				);
				return { outputFile: separatedAudioFile };
			},
		},
	],
});

export default dubbingPipeline;
