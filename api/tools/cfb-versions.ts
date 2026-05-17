import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

export const CFB_VERSIONS_RESOURCE_URI = "ui://mcp-app/cfb-versions";

// ─── shared types ─────────────────────────────────────────────────────────────

export const workerVersionSchema = z
	.object({
		id: z.string(),
		number: z.number().optional(),
		created_on: z.string().optional(),
		metadata: z
			.object({
				has_assets: z.boolean().optional(),
				has_modules: z.boolean().optional(),
				annotations: z.record(z.string(), z.string()).optional(),
			})
			.passthrough()
			.optional(),
		resources: z
			.object({
				bindings: z.array(z.record(z.string(), z.unknown())).optional(),
				script: z
					.object({ etag: z.string().optional() })
					.passthrough()
					.optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();
export type WorkerVersion = z.infer<typeof workerVersionSchema>;

export const versionRowSchema = workerVersionSchema.and(
	z.object({ isActive: z.boolean() }),
);
export type VersionRow = z.infer<typeof versionRowSchema>;

export const workerDeploymentSchema = z
	.object({
		id: z.string(),
		source: z.string().optional(),
		strategy: z.string().optional(),
		versions: z.array(
			z.object({ version_id: z.string(), percentage: z.number() }),
		),
		annotations: z.record(z.string(), z.string()).optional(),
		created_on: z.string().optional(),
		author_email: z.string().optional(),
	})
	.passthrough();
export type WorkerDeployment = z.infer<typeof workerDeploymentSchema>;

// ─── cfb_list_versions ────────────────────────────────────────────────────────

export const cfbListVersionsInputSchema = z.object({});
export type CfbListVersionsInput = z.infer<typeof cfbListVersionsInputSchema>;

export const cfbListVersionsOutputSchema = z.object({
	versions: z.array(versionRowSchema),
});
export type CfbListVersionsOutput = z.infer<typeof cfbListVersionsOutputSchema>;

export const cfbListVersionsTool = createTool({
	id: "cfb_list_versions",
	description:
		"List the most recent Cloudflare Worker versions for the configured site (last 100). Each row is flagged `isActive` if it receives any traffic in the current deployment.",
	inputSchema: cfbListVersionsInputSchema,
	outputSchema: cfbListVersionsOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_VERSIONS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const versions = (await callAdmin(
			"deco-sites/admin/loaders/hosting/cfworkers-builds/versions/list.ts",
			{ sitename: site },
			apiKey,
		)) as VersionRow[];
		return { versions };
	},
});

// ─── cfb_rollback ─────────────────────────────────────────────────────────────

export const cfbRollbackInputSchema = z.object({
	versionId: z
		.string()
		.describe(
			"The Worker version id to roll back to (must be in the last 100 versions returned by `cfb_list_versions`).",
		),
});
export type CfbRollbackInput = z.infer<typeof cfbRollbackInputSchema>;

export const cfbRollbackOutputSchema = z.object({
	deployment: workerDeploymentSchema,
	warnings: z.array(z.string()),
});
export type CfbRollbackOutput = z.infer<typeof cfbRollbackOutputSchema>;

export const cfbRollbackTool = createTool({
	id: "cfb_rollback",
	description:
		"Roll the Worker for the configured site back to a previous version by creating a new 100% deployment of that version. Best-effort compatibility check warns about binding-shape mismatches; Cloudflare may still reject incompatible rollbacks for D1/R2/KV/DO data shape changes.",
	inputSchema: cfbRollbackInputSchema,
	outputSchema: cfbRollbackOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_VERSIONS_RESOURCE_URI, visibility: ["app"] },
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
			"deco-sites/admin/actions/hosting/cfworkers-builds/deployments/rollback.ts",
			{ sitename: site, versionId: context.versionId },
			apiKey,
		)) as CfbRollbackOutput;
	},
});
