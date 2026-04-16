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
