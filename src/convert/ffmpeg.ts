import ffmpeg from "fluent-ffmpeg";
import { logger } from "../utils/logger";

export async function convertToWav(inputPath: string, outputPath: string) {
	return new Promise<string>((resolve, reject) => {
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
