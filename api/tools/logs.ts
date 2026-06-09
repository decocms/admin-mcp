import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

export const LOGS_RESOURCE_URI = "ui://mcp-app/logs";

export const getLogsDataInputSchema = z.object({});
export type GetLogsDataInput = z.infer<typeof getLogsDataInputSchema>;

export const getLogsDataOutputSchema = z.object({
	sitename: z.string(),
	apiKey: z.string().nullable(),
});
export type GetLogsDataOutput = z.infer<typeof getLogsDataOutputSchema>;

export const getLogsDataTool = createTool({
	id: "get_logs_data",
	title: "Logs",
	description:
		"Open the observability logs viewer for the configured deco.cx site. Embeds HyperDX for searching, filtering, and exploring application logs and traces.",
	inputSchema: getLogsDataInputSchema,
	outputSchema: getLogsDataOutputSchema,
	_meta: {
		ui: {
			resourceUri: LOGS_RESOURCE_URI,
			visibility: ["app"],
		},
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { apiKey, site } = getConfig(ctx);

		type Result = { apiKey: string | null };
		const res = await callAdmin(
			"deco-sites/admin/loaders/sites/hyperdx.ts",
			{ site },
			apiKey,
		).catch(() => ({ apiKey: null }));

		const data = res as Result;

		return {
			sitename: site,
			apiKey: data.apiKey ?? null,
		};
	},
});
