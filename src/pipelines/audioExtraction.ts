import z from "zod";
import { definePipeline } from "../types/pipeline";
import { convertToWav } from "../../convert/ffmpeg";

const audioExtractionPipeline = definePipeline({
	name: "Audio Extraction",
	description: "Extract audio from video files using FFmpeg.",
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
			name: "Extract Audio Stream",
			description: "Use FFmpeg to demux the video file and extract the audio stream.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				return { extracted: true, inputFile: input.inputFile };
			},
		},
		{
			name: "Convert to WAV",
			description: "Convert the audio stream to WAV format for further processing.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				const outputFile = await convertToWav(input.inputFile, input.outputFile);
				return { outputFile };
			},
		},
		{
			name: "Convert to MP3",
			description: "Convert the audio stream to MP3 format for further processing.",
			handler: async ({ input, context }) => {
				context.signal?.throwIfAborted();
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return { outputFile: input.outputFile };
				// In a real implementation, you would call a function similar to convertToWav to convert to MP3
				// For example: const outputFile = await convertToMp3(input.inputFile, input.outputFile);
				// return { outputFile };
				// Here we just simulate the conversion and return the same output file for demonstration purposes.
			},
		}
	],
});

export default audioExtractionPipeline;