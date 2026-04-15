/// <reference types="node" />
import { defineConfig, processConfig } from "@robingenz/zli";
import * as commands from "./commands";

// Configure the CLI
const config = defineConfig({
	meta: {
		name: "Anime Dubbing CLI and Managa Tool",
		version: "1.0.0",
		description:
			"A CLI tool for anime dubbing and manga ocr processing,translation and typesetting. Created by @nbth.",
	},
	commands: commands,
	defaultCommand: commands.helpCommand,
});

// Process command line arguments
try {
	const result = processConfig(config, process.argv.slice(2));
	await result.command.action(result.options, result.args);
} catch (error: any) {
	console.error("Error:", error.message);
	process.exit(1);
}
