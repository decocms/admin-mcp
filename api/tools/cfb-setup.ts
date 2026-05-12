import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import { cfBuildSchema } from "./cfb-builds.ts";

export const CFB_SETUP_RESOURCE_URI = "ui://mcp-app/cfb-setup";

// ─── shared types ─────────────────────────────────────────────────────────────

export const setupStepSchema = z.enum([
	"load_site",
	"resolve_repo",
	"connect_repo",
	"ensure_worker",
	"check_worker_collision",
	"create_prod_trigger",
	"create_preview_trigger",
	"audit",
]);
export type SetupStep = z.infer<typeof setupStepSchema>;

export const setupErrorSchema = z.object({
	step: setupStepSchema,
	code: z.string(),
	cfErrorCode: z.number().optional(),
	message: z.string(),
	hint: z.string().optional(),
});
export type SetupError = z.infer<typeof setupErrorSchema>;

// ─── cfb_setup ────────────────────────────────────────────────────────────────

export const cfbSetupInputSchema = z.object({
	rootDirectory: z
		.string()
		.optional()
		.describe(
			"Root directory inside the repo to build from (defaults to repo root).",
		),
	buildCommand: z
		.string()
		.optional()
		.describe("Custom build command (defaults to the repo's wrangler config)."),
	deployCommand: z
		.string()
		.optional()
		.describe("Custom deploy command (defaults to `wrangler deploy`)."),
});
export type CfbSetupInput = z.infer<typeof cfbSetupInputSchema>;

export const cfbSetupOutputSchema = z.object({
	ok: z.boolean(),
	workerName: z.string(),
	workerExists: z.boolean(),
	workerTag: z.string().nullable(),
	repoConnectionId: z.string().nullable(),
	prodTriggerUuid: z.string().nullable(),
	previewTriggerUuid: z.string().nullable(),
	errors: z.array(setupErrorSchema),
});
export type CfbSetupOutput = z.infer<typeof cfbSetupOutputSchema>;

export const cfbSetupTool = createTool({
	id: "cfb_setup",
	description:
		"One-click Cloudflare Workers Builds onboarding for the configured site: connects the GitHub repo, ensures the Worker script exists, and creates the production + preview build triggers. Idempotent — safe to re-run; missing steps will be filled in and per-step errors are surfaced in `errors[]`.",
	inputSchema: cfbSetupInputSchema,
	outputSchema: cfbSetupOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_SETUP_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/actions/hosting/cfworkers-builds/setup/oneClick.ts",
			{
				sitename: site,
				...(context.rootDirectory
					? { rootDirectory: context.rootDirectory }
					: {}),
				...(context.buildCommand ? { buildCommand: context.buildCommand } : {}),
				...(context.deployCommand
					? { deployCommand: context.deployCommand }
					: {}),
			},
			apiKey,
		)) as CfbSetupOutput;
	},
});

// ─── cfb_setup_status ─────────────────────────────────────────────────────────

export const cfbSetupStatusInputSchema = z.object({});
export type CfbSetupStatusInput = z.infer<typeof cfbSetupStatusInputSchema>;

export const cfbSetupStatusOutputSchema = z.object({
	workerName: z.string(),
	workerExists: z.boolean(),
	workerTag: z.string().nullable(),
	repoConnected: z.boolean(),
	prodTrigger: z.object({ trigger_uuid: z.string() }).nullable(),
	previewTrigger: z.object({ trigger_uuid: z.string() }).nullable(),
	lastBuild: cfBuildSchema.nullable(),
});
export type CfbSetupStatusOutput = z.infer<typeof cfbSetupStatusOutputSchema>;

export const cfbSetupStatusTool = createTool({
	id: "cfb_setup_status",
	description:
		"Read-only snapshot of the Cloudflare Workers Builds setup for the configured site: whether the repo is connected, the Worker exists, the prod/preview triggers exist, and the most recent build. Safe to call before any setup has happened.",
	inputSchema: cfbSetupStatusInputSchema,
	outputSchema: cfbSetupStatusOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_SETUP_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/loaders/hosting/cfworkers-builds/setup/status.ts",
			{ sitename: site },
			apiKey,
		)) as CfbSetupStatusOutput;
	},
});
