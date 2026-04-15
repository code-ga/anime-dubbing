import { defineCommand } from "@robingenz/zli";
import { logger } from "../utils/logger";

export const helpCommand = defineCommand({
	description: "Show help information",
	action: async () => {
		logger.info("This is the help command. Use --help for more details.");
	},
});
