import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
	DECO_ADMIN_API_KEY: z
		.string()
		.describe("API key for authenticating with the deco.cx admin API"),
	SITE_NAME: z
		.string()
		.describe(
			"The deco.cx site name to manage (e.g. my-store). All tools will operate on this site.",
		),
});

export type Env = DefaultEnv<typeof StateSchema>;
