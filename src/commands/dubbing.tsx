import { mkdir } from "node:fs/promises";
import path from "node:path";
import { defineCommand, defineOptions } from "@robingenz/zli";
import z from "zod";
import { ReplicateUtil } from "../class/replicate";
import { PipelineApp } from "../pages/PipelineApp";
import { dubbingPipeline } from "../pipelines";
import { loadCheckpoint } from "../utils/checkpoint";
import { renderToCli } from "../utils/cliRenderer";
import { logger } from "../utils/logger";

export const dubbing = defineCommand({
	description: "dubbing someone",
	options: defineOptions(
		z.object({
			inputFile: z.string().describe("Input file for dubbing"),
			tmpDirectory: z
				.string()
				.describe("Temporary directory for processing")
				.default("./tmp"),
			outputFile: z
				.string()
				.describe("Output file for the dubbed video")
				.default("output.mp4"),
			targetLanguage: z
				.string()
				.describe("Target language for dubbing")
				.default("en"),
			sourceLanguage: z
				.string()
				.describe("Source language of the audio")
				.default("None"),
			subtitleDirectory: z
				.string()
				.describe("Directory to save SRT subtitle files")
				.optional(),
			backgroundVolume: z
				.number()
				.describe("Volume for original background audio (0.0-1.0)")
				.min(0)
				.max(1)
				.default(0.25),
			dubbedVolume: z
				.number()
				.describe("Volume for dubbed audio (0.0-1.0)")
				.min(0)
				.max(1)
				.default(1.0),
		}),
		{
			i: "inputFile",
			t: "tmpDirectory",
			o: "outputFile",
			l: "targetLanguage",
			s: "sourceLanguage",
			S: "subtitleDirectory",
			b: "backgroundVolume",
			v: "dubbedVolume",
		},
	),
	action: async (options) => {
		logger.info("Starting dubbing process...", options);
		const absoluteTmpDir = path.isAbsolute(options.tmpDirectory)
			? options.tmpDirectory
			: path.join(process.cwd(), options.tmpDirectory);
		logger.debug(`Resolved temporary directory: ${absoluteTmpDir}`);
		await mkdir(absoluteTmpDir, { recursive: true });
		logger.info(`Temporary directory is ready: ${absoluteTmpDir}`);

		const checkpoint = await loadCheckpoint(
			absoluteTmpDir,
			dubbingPipeline.name,
			dubbingPipeline.steps.map((s) => s.name),
		);

		const replicateUtil = new ReplicateUtil();

		await renderToCli(
			<PipelineApp
				pipeline={dubbingPipeline}
				input={{
					inputFile: options.inputFile,
					outputFile: options.outputFile,
					targetLanguage: options.targetLanguage,
					tmpDirectory: absoluteTmpDir,
					sourceLanguage: options.sourceLanguage,
					subtitleDirectory: options.subtitleDirectory,
					backgroundVolume: options.backgroundVolume,
					dubbedVolume: options.dubbedVolume,
				}}
				outputFile={options.outputFile}
				checkpoint={checkpoint}
				tmpDirectory={absoluteTmpDir}
				args={{
					replicateUtil,
					backgroundVolume: options.backgroundVolume,
					dubbedVolume: options.dubbedVolume,
				}}
			/>,
		);
	},
});
