import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig, resolveEnv } from "../lib/admin.ts";

// ─── pod_logs ─────────────────────────────────────────────────────────────────

export const podLogsInputSchema = z.object({
	environment: z
		.string()
		.optional()
		.describe(
			"Environment name (e.g. 'production'). Defaults to the user's sandbox environment.",
		),
	tailLines: z
		.number()
		.optional()
		.describe("Number of recent log lines to fetch. Defaults to 100."),
	podIndex: z
		.number()
		.optional()
		.describe("StatefulSet pod index. Defaults to 0 (first replica)."),
	containerName: z
		.string()
		.optional()
		.describe('Container name inside the pod. Defaults to "app".'),
});
export type PodLogsInput = z.infer<typeof podLogsInputSchema>;

export const podLogsOutputSchema = z.object({
	logs: z.string(),
	podName: z.string(),
	containerName: z.string(),
	error: z.string().optional(),
});
export type PodLogsOutput = z.infer<typeof podLogsOutputSchema>;

export const podLogsTool = createTool({
	id: "pod_logs",
	description:
		"Fetch recent terminal logs from a pod for the configured deco.cx site. Useful for debugging runtime errors, checking deployment status, or inspecting application output. Defaults to the user's sandbox environment if no environment is specified.",
	inputSchema: podLogsInputSchema,
	outputSchema: podLogsOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);

		const environment = context.environment ?? (await resolveEnv(ctx));

		const data = (await callAdmin(
			"deco-sites/admin/loaders/environments/podLogs.ts",
			{
				site,
				environment,
				podIndex: context.podIndex ?? 0,
				tailLines: context.tailLines ?? 100,
				follow: false,
				containerName: context.containerName ?? "app",
			},
			apiKey,
		)) as PodLogsOutput;

		return data;
	},
});
