import { readFile } from "fs/promises";
import Replicate from "replicate";
export class ReplicateUtil {
	constructor(
		public replicate = new Replicate({
			baseUrl: "https://ai.hackclub.com/proxy/v1/replicate",
		}),
	) {}

	async isolationSpeechFromAudio(audioUrl: string) {
		const audio = audioUrl.startsWith("http")
			? audioUrl
			: await readFile(audioUrl);
		const output = await this.replicate.run("geopti/sam-audio-large", {
			input: {
				audio: audio,
				description: "speech",
				span_anchors: "[]",
				predict_spans: true,
				output_residual: false,
				use_span_prompting: false,
			},
		});
		return output;
	}
}
