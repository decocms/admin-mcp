import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { getConfig } from "../lib/admin.ts";

// ─── test_loader ──────────────────────────────────────────────────────────────

export const testLoaderInputSchema = z.object({
	key: z
		.string()
		.describe(
			'The loader key to invoke, e.g. "site/loaders/myLoader.ts".',
		),
	props: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Props object to pass to the loader."),
});
export type TestLoaderInput = z.infer<typeof testLoaderInputSchema>;

export const testLoaderOutputSchema = z.object({
	data: z.unknown(),
	error: z.string().optional(),
});
export type TestLoaderOutput = z.infer<typeof testLoaderOutputSchema>;

export const testLoaderTool = createTool({
	id: "test_loader",
	description:
		"Invoke a loader on the configured deco.cx site via /live/invoke and return the result. Useful for testing loaders during development.",
	inputSchema: testLoaderInputSchema,
	outputSchema: testLoaderOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site } = getConfig(ctx);
		const url = `https://${site}.deco.site/live/invoke`;

		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: context.key,
				props: context.props ?? {},
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => res.statusText);
			return { data: null, error: `Invoke failed (${res.status}): ${text}` };
		}

		const data = await res.json();
		return { data };
	},
});
