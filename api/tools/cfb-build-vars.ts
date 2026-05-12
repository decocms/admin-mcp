import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

export const CFB_BUILD_VARS_RESOURCE_URI = "ui://mcp-app/cfb-build-vars";

const NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NAME_HINT =
	"Letters, digits, and underscore only; must start with a letter or underscore; max 64 chars.";

export const buildVarsResultSchema = z.object({
	triggerUuid: z.string(),
	buildVars: z.record(z.string(), z.string()),
});
export type BuildVarsResult = z.infer<typeof buildVarsResultSchema>;

// ─── cfb_list_build_vars ──────────────────────────────────────────────────────

export const cfbListBuildVarsInputSchema = z.object({});
export type CfbListBuildVarsInput = z.infer<typeof cfbListBuildVarsInputSchema>;

export const cfbListBuildVarsOutputSchema = buildVarsResultSchema;
export type CfbListBuildVarsOutput = z.infer<
	typeof cfbListBuildVarsOutputSchema
>;

export const cfbListBuildVarsTool = createTool({
	id: "cfb_list_build_vars",
	description:
		"List Cloudflare build-time variables for the configured site's production trigger. Build vars are visible to anyone with access to the site — for secrets that must stay hidden, use `cfb_set_secret` instead.",
	inputSchema: cfbListBuildVarsInputSchema,
	outputSchema: cfbListBuildVarsOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILD_VARS_RESOURCE_URI, visibility: ["app"] },
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
			"deco-sites/admin/loaders/hosting/cfworkers-builds/vars/list.ts",
			{ sitename: site },
			apiKey,
		)) as CfbListBuildVarsOutput;
	},
});

// ─── cfb_set_build_var ────────────────────────────────────────────────────────

export const cfbSetBuildVarInputSchema = z.object({
	name: z
		.string()
		.regex(NAME_REGEX, NAME_HINT)
		.describe(`Build var name. ${NAME_HINT}`),
	value: z
		.string()
		.describe("Build var value (plain text, visible after set)."),
});
export type CfbSetBuildVarInput = z.infer<typeof cfbSetBuildVarInputSchema>;

export const cfbSetBuildVarOutputSchema = buildVarsResultSchema;
export type CfbSetBuildVarOutput = z.infer<typeof cfbSetBuildVarOutputSchema>;

export const cfbSetBuildVarTool = createTool({
	id: "cfb_set_build_var",
	description:
		"Create or update a Cloudflare build-time variable on the configured site's production trigger. Overwrites the value if the name already exists. These are NOT runtime secrets — values are plain-text and visible.",
	inputSchema: cfbSetBuildVarInputSchema,
	outputSchema: cfbSetBuildVarOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILD_VARS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/actions/hosting/cfworkers-builds/vars/set.ts",
			{ sitename: site, name: context.name, value: context.value },
			apiKey,
		)) as CfbSetBuildVarOutput;
	},
});

// ─── cfb_delete_build_var ─────────────────────────────────────────────────────

export const cfbDeleteBuildVarInputSchema = z.object({
	name: z
		.string()
		.regex(NAME_REGEX, NAME_HINT)
		.describe("Build var name to remove."),
});
export type CfbDeleteBuildVarInput = z.infer<
	typeof cfbDeleteBuildVarInputSchema
>;

export const cfbDeleteBuildVarOutputSchema = buildVarsResultSchema;
export type CfbDeleteBuildVarOutput = z.infer<
	typeof cfbDeleteBuildVarOutputSchema
>;

export const cfbDeleteBuildVarTool = createTool({
	id: "cfb_delete_build_var",
	description:
		"Remove a Cloudflare build-time variable from the configured site's production trigger.",
	inputSchema: cfbDeleteBuildVarInputSchema,
	outputSchema: cfbDeleteBuildVarOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_BUILD_VARS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return (await callAdmin(
			"deco-sites/admin/actions/hosting/cfworkers-builds/vars/delete.ts",
			{ sitename: site, name: context.name },
			apiKey,
		)) as CfbDeleteBuildVarOutput;
	},
});
