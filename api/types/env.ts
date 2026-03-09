import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
	SITE_NAME: z
		.string()
		.describe(
			"The deco.cx site name to manage (e.g. my-store). All tools will operate on this site!!",
		),
	ANTHROPIC_API_KEY: z
		.string()
		.optional()
		.describe(
			"Anthropic API key used when creating sandbox environments that run Claude Code. Required if SAVED_KEY_ID is not provided.",
		),
	SAVED_KEY_ID: z
		.string()
		.optional()
		.describe(
			"ID of a saved Anthropic API key stored in deco.cx. Used instead of ANTHROPIC_API_KEY when creating Claude Code sandbox environments.",
		),
});

export type Env = DefaultEnv<typeof StateSchema>;
