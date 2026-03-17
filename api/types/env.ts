import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
	SITE_NAME: z
		.string()
		.describe(
			"The deco.cx site name to manage (e.g. my-store). All tools will operate on this site!!",
		),
});

export type Env = DefaultEnv<typeof StateSchema>;
