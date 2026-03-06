import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { PREVIEW_FRAME_DOMAINS } from "api/resources/environments.ts";

export const ENVIRONMENTS_RESOURCE_URI = "ui://mcp-app/environments";

const ADMIN_BASE_URL = process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

// ─── shared schema ────────────────────────────────────────────────────────────

export const environmentSchema = z
	.object({
		name: z.string(),
		url: z.string(),
		slug: z.string().optional(),
		head: z.string().optional(),
		upstream: z.string().optional(),
		createdAt: z.string().optional(),
		readonly: z.boolean().optional(),
		public: z.boolean().optional(),
		transient: z.boolean().optional(),
		platform: z.string().optional(),
	})
	.passthrough();

export type AdminEnvironment = z.infer<typeof environmentSchema>;

// ─── helpers ─────────────────────────────────────────────────────────────────

async function callAdmin(
	path: string,
	body: unknown,
	apiKey: string,
): Promise<unknown> {
	const res = await fetch(
		`${ADMIN_BASE_URL}/live/invoke/${path}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify(body),
		},
	);
	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(`Admin API error (${res.status}): ${text}`);
	}
	return res.json();
}

function getConfig(env: Env) {
	const state = env.MESH_REQUEST_CONTEXT?.state;
	const apiKey = state?.DECO_ADMIN_API_KEY;
	const site = state?.SITE_NAME;
	if (!site) throw new Error("SITE_NAME is not configured.");
	if (!apiKey) throw new Error("DECO_ADMIN_API_KEY is not configured.");
	return { site, apiKey };
}

// ─── list_environments ────────────────────────────────────────────────────────

export const listEnvironmentsInputSchema = z.object({});
export type ListEnvironmentsInput = z.infer<typeof listEnvironmentsInputSchema>;

export const listEnvironmentsOutputSchema = z.object({
	environments: z.array(environmentSchema),
	site: z.string(),
});
export type ListEnvironmentsOutput = z.infer<
	typeof listEnvironmentsOutputSchema
>;

export const listEnvironmentsTool = (env: Env) =>
	createTool({
		id: "list_environments",
		description:
			"List all environments for the configured deco.cx site. Returns each environment's name, URL, platform, branch/commit, and metadata.",
		inputSchema: listEnvironmentsInputSchema,
		outputSchema: listEnvironmentsOutputSchema,
		_meta: { ui: { resourceUri: ENVIRONMENTS_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async () => {
			const { site, apiKey } = getConfig(env);
			// list loader uses `sitename` prop
			const data = (await callAdmin(
				"deco-sites/admin/loaders/environments/list.ts",
				{ sitename: site },
				apiKey,
			)) as AdminEnvironment[] | { environments: AdminEnvironment[] };
			const environments = Array.isArray(data)
				? data
				: (data as { environments: AdminEnvironment[] }).environments ?? [];
			return { environments, site };
		},
	});

// ─── get_environment ──────────────────────────────────────────────────────────

export const getEnvironmentInputSchema = z.object({
	name: z.string().describe("The environment name"),
});
export type GetEnvironmentInput = z.infer<typeof getEnvironmentInputSchema>;

export const getEnvironmentOutputSchema = z.object({
	environment: environmentSchema,
	site: z.string(),
	previewUrl: z.string(),
});
export type GetEnvironmentOutput = z.infer<typeof getEnvironmentOutputSchema>;

export const getEnvironmentTool = (env: Env) =>
	createTool({
		id: "get_environment",
		description:
			"Get details of a specific environment by name, including its URL, platform, git branch/commit, and a ready-to-use preview URL.",
		inputSchema: getEnvironmentInputSchema,
		outputSchema: getEnvironmentOutputSchema,
		_meta: { ui: { resourceUri: ENVIRONMENTS_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const environment = (await callAdmin(
				"deco-sites/admin/loaders/environments/get.ts",
				{ site, name: context.name },
				apiKey,
			)) as AdminEnvironment;
			const previewUrl = `${environment.url}?__cb=${crypto.randomUUID()}`;
			return { environment, site, previewUrl };
		},
	});

// ─── create_environment ───────────────────────────────────────────────────────

export const createEnvironmentInputSchema = z.object({
	name: z
		.string()
		.describe(
			"Name for the new environment (e.g. 'staging', 'my-feature-branch')",
		),
	branch: z
		.string()
		.optional()
		.describe("Git branch to base the environment on (defaults to main branch)"),
	platform: z
		.enum(["deco", "content", "tunnel"])
		.optional()
		.describe("Environment platform — deco (K8s, default), content, or tunnel"),
});
export type CreateEnvironmentInput = z.infer<
	typeof createEnvironmentInputSchema
>;

export const createEnvironmentOutputSchema = z.object({
	environment: environmentSchema,
	site: z.string(),
	previewUrl: z.string(),
	message: z.string(),
});
export type CreateEnvironmentOutput = z.infer<
	typeof createEnvironmentOutputSchema
>;

export const createEnvironmentTool = (env: Env) =>
	createTool({
		id: "create_environment",
		description:
			"Create a new environment for the configured deco.cx site. Provisions a Kubernetes deployment and returns the environment URL once ready (takes 1–3 minutes for deco platform).",
		inputSchema: createEnvironmentInputSchema,
		outputSchema: createEnvironmentOutputSchema,
		_meta: { ui: { resourceUri: ENVIRONMENTS_RESOURCE_URI } },
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const environment = (await callAdmin(
				"deco-sites/admin/actions/environments/create.ts",
				{
					site,
					name: context.name,
					...(context.branch ? { options: { branch: context.branch } } : {}),
					...(context.platform ? { platform: context.platform } : {}),
				},
				apiKey,
			)) as AdminEnvironment;
			const previewUrl = `${environment.url}?__cb=${crypto.randomUUID()}`;
			return {
				environment,
				site,
				previewUrl,
				message: `Environment "${context.name}" created at ${environment.url}`,
			};
		},
	});

// ─── preview_environment ──────────────────────────────────────────────────────

export const previewEnvironmentInputSchema = z.object({
	name: z.string().describe("Environment name to preview"),
	path: z
		.string()
		.default("/")
		.describe("Path to preview within the environment (default: '/')"),
});
export type PreviewEnvironmentInput = z.infer<
	typeof previewEnvironmentInputSchema
>;

export const previewEnvironmentOutputSchema = z.object({
	previewUrl: z.string(),
	environment: environmentSchema,
	site: z.string(),
	path: z.string(),
});
export type PreviewEnvironmentOutput = z.infer<
	typeof previewEnvironmentOutputSchema
>;

export const previewEnvironmentTool = (env: Env) =>
	createTool({
		id: "preview_environment",
		description:
			"Get a live preview URL for a specific path in an environment. Includes a cache-busting parameter so the latest version is always served.",
		inputSchema: previewEnvironmentInputSchema,
		outputSchema: previewEnvironmentOutputSchema,
		_meta: { ui: { resourceUri: ENVIRONMENTS_RESOURCE_URI, csp: { frameDomains: PREVIEW_FRAME_DOMAINS } } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const environment = (await callAdmin(
				"deco-sites/admin/loaders/environments/get.ts",
				{ site, name: context.name },
				apiKey,
			)) as AdminEnvironment;
			const path = context.path ?? "/";
			const sep = path.includes("?") ? "&" : "?";
			const previewUrl = `${environment.url}${path.startsWith("/") ? "" : "/"}${path}${sep}__cb=${crypto.randomUUID()}`;
			return { previewUrl, environment, site, path };
		},
	});
