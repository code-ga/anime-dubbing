import { defineCommand, defineOptions } from "@robingenz/zli";
import z from "zod";
import { audioExtractionPipeline } from "../pipelines";
import { PipelineApp } from "../pages/PipelineApp";
import { renderToCli } from "../utils/cliRenderer";

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
				.describe("Output file for the dubbed audio")
				.default("output.wav"),
			targetLanguage: z
				.string()
				.describe("Target language for dubbing")
				.default("en"),
		}),
		{ i: "inputFile", t: "tmpDirectory", o: "outputFile", l: "targetLanguage" },
	),
	action: async (options) => {
		await renderToCli(
			<PipelineApp
				pipeline={audioExtractionPipeline}
				input={{
					inputFile: options.inputFile,
					outputFile: options.outputFile,
					targetLanguage: options.targetLanguage,
				}}
				outputFile={options.outputFile}
			/>,
		);
	},
});
