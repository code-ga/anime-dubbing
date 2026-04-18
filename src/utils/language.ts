import {
	LANGUAGE_MAP,
	type LanguageCode,
	SUPPORTED_LANGUAGES,
	QWEN_TTS_SUPPORTED_LANGUAGES,
	MINIMAX_TTS_SUPPORTED_LANGUAGES,
} from "../types/language";

export function isSupportedLanguage(code: string): code is LanguageCode {
	return (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

export function isQwenTTSSupported(language: LanguageCode): boolean {
	return QWEN_TTS_SUPPORTED_LANGUAGES.includes(language);
}

export function isMiniMaxTTSSupported(language: LanguageCode): boolean {
	return MINIMAX_TTS_SUPPORTED_LANGUAGES.includes(language);
}

export function getLanguageInfo(
	code: LanguageCode,
): (typeof LANGUAGE_MAP)[LanguageCode] {
	return LANGUAGE_MAP[code];
}

export function getLanguageName(code: LanguageCode): string {
	return LANGUAGE_MAP[code]?.name ?? code;
}

export function validateLanguage(code: string): LanguageCode {
	if (!isSupportedLanguage(code)) {
		throw new Error(
			`Unsupported language: ${code}. Supported languages: ${SUPPORTED_LANGUAGES.join(", ")}`,
		);
	}
	return code as LanguageCode;
}

export function requiresRefAudio(language: LanguageCode): boolean {
	return !isQwenTTSSupported(language);
}

export function getLanguageNameForTranslation(language: LanguageCode): string {
	return LANGUAGE_MAP[language]?.translationName ?? language;
}

/**
 * Normalizes a language name or code to its standard translation name.
 * e.g., "english" -> "English", "en" -> "English", "ja" -> "Japanese"
 */
export function normalizeLanguageName(input: string): string {
	const lowerInput = input.toLowerCase();

	// Check if it's a code
	if (isSupportedLanguage(lowerInput)) {
		return getLanguageNameForTranslation(lowerInput as LanguageCode);
	}

	// Check if it's a long name (case-insensitive)
	const matchByLongName = Object.values(LANGUAGE_MAP).find(
		(info) => info.name.toLowerCase() === lowerInput,
	);
	if (matchByLongName) {
		return matchByLongName.translationName;
	}

	return input;
}

/**
 * Determines which TTS provider to use based on language support and optional preference.
 */
export function getTTSProvider(
	language: LanguageCode,
	preference: "auto" | "qwen" | "minimax" = "auto",
): "qwen" | "minimax" {
	if (preference === "qwen") {
		if (!isQwenTTSSupported(language)) {
			throw new Error(`Language "${language}" is not supported by Qwen TTS.`);
		}
		return "qwen";
	}

	if (preference === "minimax") {
		if (!isMiniMaxTTSSupported(language)) {
			throw new Error(`Language "${language}" is not supported by MiniMax TTS.`);
		}
		return "minimax";
	}

	// Default "auto" logic
	return isQwenTTSSupported(language) ? "qwen" : "minimax";
}