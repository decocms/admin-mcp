import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

export const CFB_BUILDS_RESOURCE_URI = "ui://mcp-app/cfb-builds";

// ─── shared types ─────────────────────────────────────────────────────────────

export const cfBuildStatusSchema = z.enum([
	"queued",
	"initializing",
	"running",
	"success",
	"failure",
	"cancelled",
]);
export type CfBuildStatus = z.infer<typeof cfBuildStatusSchema>;

export const cfBuildSchema = z
	.object({
		build_uuid: z.string(),
		build_id: z.string().optional(),
		external_script_id: z.string(),
		status: cfBuildStatusSchema,
		branch: z.string().optional(),
		commit_hash: z.string().optional(),
		commit_message: z.string().optional(),
		created_on: z.string(),
		modified_on: z.string().optional(),
		build_duration_ms: z.number().optional(),
		trigger: z
			.object({
				source: z.string(),
				trigger_uuid: z.string().optional(),
			})
			.optional(),
	})
	.passthrough();
export type CfBuild = z.infer<typeof cfBuildSchema>;

export const cfBuildLogChunkSchema = z
	.object({
		line: z.number(),
		message: z.string(),
		timestamp: z.string().optional(),
		stream: z.enum(["stdout", "stderr"]).optional(),
	})
	.passthrough();
export type CfBuildLogChunk = z.infer<typeof cfBuildLogChunkSchema>;

// ─── cfb_list_builds ──────────────────────────────────────────────────────────

export const cfbListBuildsInputSchema = z.object({
	pageSize: z
		.number()
		.int()
		.min(1)
		.max(100)
		.optional()
		.describe("Maximum number of builds to return (default: 25)."),
});
export type CfbListBuildsInput = z.infer<typeof cfbListBuildsInputSchema>;

export const cfbListBuildsOutputSchema = z.object({
	builds: z.array(cfBuildSchema),
});
export type CfbListBuildsOutput = z.infer<typeof cfbListBuildsOutputSchema>;

export const cfbListBuildsTool = createTool({
	id: "cfb_list_builds",
	description:
		"List recent Cloudflare Workers Builds for the configured site, newest first. Returns build id, status, branch, commit, and duration.",
	inputSchema: cfbListBuildsInputSchema,
	outputSchema: cfbListBuildsOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILDS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const builds = (await callAdmin(
			"deco-sites/admin/loaders/hosting/cfworkers-builds/builds/list.ts",
			{
				sitename: site,
				...(context.pageSize ? { pageSize: context.pageSize } : {}),
			},
			apiKey,
		)) as CfBuild[];
		return { builds };
	},
});

// ─── cfb_get_build ────────────────────────────────────────────────────────────

export const cfbGetBuildInputSchema = z.object({
	buildId: z.string().describe("The Cloudflare build UUID."),
});
export type CfbGetBuildInput = z.infer<typeof cfbGetBuildInputSchema>;

export const cfbGetBuildOutputSchema = cfBuildSchema;
export type CfbGetBuildOutput = z.infer<typeof cfbGetBuildOutputSchema>;

export const cfbGetBuildTool = createTool({
	id: "cfb_get_build",
	description:
		"Fetch details for a single Cloudflare Workers build by UUID. Use this to refresh the status of a running build without re-listing.",
	inputSchema: cfbGetBuildInputSchema,
	outputSchema: cfbGetBuildOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILDS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/loaders/hosting/cfworkers-builds/builds/get.ts",
			{ sitename: site, buildId: context.buildId },
			apiKey,
		)) as CfbGetBuildOutput;
	},
});

// ─── cfb_get_build_logs ───────────────────────────────────────────────────────

export const cfbGetBuildLogsInputSchema = z.object({
	buildId: z.string().describe("The Cloudflare build UUID."),
});
export type CfbGetBuildLogsInput = z.infer<typeof cfbGetBuildLogsInputSchema>;

export const cfbGetBuildLogsOutputSchema = z.object({
	lines: z.array(cfBuildLogChunkSchema),
});
export type CfbGetBuildLogsOutput = z.infer<typeof cfbGetBuildLogsOutputSchema>;

export const cfbGetBuildLogsTool = createTool({
	id: "cfb_get_build_logs",
	description:
		"Fetch the full log output for a Cloudflare Workers build by UUID. Cloudflare returns the logs as a single blob; the UI paginates client-side for large logs.",
	inputSchema: cfbGetBuildLogsInputSchema,
	outputSchema: cfbGetBuildLogsOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILDS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/loaders/hosting/cfworkers-builds/builds/logs.ts",
			{ sitename: site, buildId: context.buildId },
			apiKey,
		)) as CfbGetBuildLogsOutput;
	},
});

// ─── cfb_trigger_build ────────────────────────────────────────────────────────

export const cfbTriggerBuildInputSchema = z.object({});
export type CfbTriggerBuildInput = z.infer<typeof cfbTriggerBuildInputSchema>;

export const cfbTriggerBuildOutputSchema = cfBuildSchema;
export type CfbTriggerBuildOutput = z.infer<typeof cfbTriggerBuildOutputSchema>;

export const cfbTriggerBuildTool = createTool({
	id: "cfb_trigger_build",
	description:
		"Manually trigger a new Cloudflare Workers production build for the configured site. Returns the new build's metadata so the UI can poll its status.",
	inputSchema: cfbTriggerBuildInputSchema,
	outputSchema: cfbTriggerBuildOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILDS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/actions/hosting/cfworkers-builds/builds/trigger.ts",
			{ sitename: site },
			apiKey,
		)) as CfbTriggerBuildOutput;
	},
});
