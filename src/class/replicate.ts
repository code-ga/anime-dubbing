import { readFile } from "node:fs/promises";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import Replicate from "replicate";
import { logger } from "../utils/logger";

export interface TranscriptionOutput {
	end: number;
	text: string;
	start: number;
	words?: {
		end: number;
		word: string;
		start: number;
		speaker: string;
		probability: number;
	}[];
	speaker?: string;
	duration: number;
	avg_logprob?: number;
}

interface ReplicateWhisperOutput {
	chunks: { text: string; timestamp: [number, number] }[];
	text: string;
}

export class ReplicateUtil {
	constructor(
		public replicate = new Replicate({
			baseUrl: "https://ai.hackclub.com/proxy/v1/replicate",
		}),
		public hackclub = createOpenRouter({
			apiKey: process.env.HACK_CLUB_AI_API_KEY,
			baseUrl: "https://ai.hackclub.com/proxy/v1",
		}),
	) {}

	async isolationSpeechFromAudio(audioUrl: string) {
		const audio = audioUrl.startsWith("http")
			? audioUrl
			: `data:audio/wav;base64,${(await readFile(audioUrl)).toString("base64")}`;
		const output = await this.replicate.run(
			"geopti/sam-audio-large:d8a8a4fcdcbf0bdc863f6d98cd2117ec0bc02224b576c7b98b2a009a8a1f83fa",
			{
				input: {
					audio: audio,
					description: "speech",
					span_anchors: "[]",
					predict_spans: true,
					output_residual: false,
					use_span_prompting: false,
				},
			},
		);
		return output;
	}

	async transcribeAudio(
		audioUrl: string,
		sourceLanguage: string = "None",
	): Promise<TranscriptionOutput[]> {
		const audio = audioUrl.startsWith("http")
			? audioUrl
			: `data:audio/wav;base64,${(await readFile(audioUrl)).toString("base64")}`;
		logger.debug(`Transcribing audio: ${audioUrl} with Replicate API`);
		const output = await this.replicate.run(
			"vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c",
			{
				input: {
					task: "transcribe",
					audio: audio,
					language: sourceLanguage !== "None" ? sourceLanguage : undefined,
					timestamp: "chunk",
					batch_size: 64,
					// diarise_audio: true,
					// hf_token: process.env.HF_TOKEN, // Pass HF token for diarization
				},
			},
		);

		const whisperOutput = output as ReplicateWhisperOutput;
		const chunks = whisperOutput.chunks ?? [];
		const result: TranscriptionOutput[] = chunks.map((chunk) => ({
			text: chunk.text,
			start: chunk.timestamp[0],
			end: chunk.timestamp[1],
			duration: chunk.timestamp[1] - chunk.timestamp[0],
		}));

		return result;
	}

	async translateTranscript<T extends TranscriptionOutput>(
		transcriptions: T[],
		targetLanguage: string,
		sourceLanguage: string = "auto",
	): Promise<(T & { translated: string })[]> {
		if (transcriptions.length === 0) return [];

		const textToTranslate = transcriptions.map((t) => t.text).join("\n");

		const languageNames: Record<string, string> = {
			en: "English",
			ja: "Japanese",
			ko: "Korean",
			zh: "Chinese",
			es: "Spanish",
			fr: "French",
			de: "German",
			it: "Italian",
			pt: "Portuguese",
			ru: "Russian",
			ar: "Arabic",
			hi: "Hindi",
			th: "Thai",
			vi: "Vietnamese",
			id: "Indonesian",
			ms: "Malay",
		};

		const targetLang = languageNames[targetLanguage] || targetLanguage;
		const sourceLang =
			sourceLanguage === "auto"
				? "the original language"
				: languageNames[sourceLanguage] || sourceLanguage;

		const systemPrompt = `You are a professional translator specializing in anime and media content. Translate the following text from ${sourceLang} to ${targetLang}. Preserve the meaning, tone, and context as naturally as possible. Only output the translated text, no explanations.`;

		const { text: translatedText } = await generateText({
			model: this.hackclub("meta-llama/llama-3.1-8b-instruct"),
			prompt: textToTranslate,
			system: systemPrompt,
		});

		const translatedChunks = translatedText
			.split("\n")
			.filter((chunk) => chunk.trim() !== "");

		const result: (T & { translated: string })[] = transcriptions.map(
			(transcription, index) => ({
				...transcription,
				translated: translatedChunks[index] || transcription.text,
			}),
		);

		return result;
	}
}
