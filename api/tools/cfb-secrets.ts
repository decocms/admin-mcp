import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

export const CFB_SECRETS_RESOURCE_URI = "ui://mcp-app/cfb-secrets";

// CF: secret/var names must match this regex.
const NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NAME_HINT =
	"Letters, digits, and underscore only; must start with a letter or underscore; max 64 chars.";

export const workerSecretTypeSchema = z.enum(["secret_text", "secret_key"]);
export type WorkerSecretType = z.infer<typeof workerSecretTypeSchema>;

export const workerSecretBindingSchema = z.object({
	name: z.string(),
	type: workerSecretTypeSchema,
});
export type WorkerSecretBinding = z.infer<typeof workerSecretBindingSchema>;

// ─── cfb_list_secrets ─────────────────────────────────────────────────────────

export const cfbListSecretsInputSchema = z.object({});
export type CfbListSecretsInput = z.infer<typeof cfbListSecretsInputSchema>;

export const cfbListSecretsOutputSchema = z.object({
	secrets: z.array(workerSecretBindingSchema),
});
export type CfbListSecretsOutput = z.infer<typeof cfbListSecretsOutputSchema>;

export const cfbListSecretsTool = createTool({
	id: "cfb_list_secrets",
	description:
		"List Cloudflare runtime secret names bound to the Worker for the configured site. Cloudflare never returns secret values — only names and types.",
	inputSchema: cfbListSecretsInputSchema,
	outputSchema: cfbListSecretsOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_SECRETS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const secrets = (await callAdmin(
			"deco-sites/admin/loaders/hosting/cfworkers-builds/secrets/list.ts",
			{ sitename: site },
			apiKey,
		)) as WorkerSecretBinding[];
		return { secrets };
	},
});

// ─── cfb_set_secret ───────────────────────────────────────────────────────────

export const cfbSetSecretInputSchema = z.object({
	name: z
		.string()
		.regex(NAME_REGEX, NAME_HINT)
		.describe(`Secret name. ${NAME_HINT}`),
	value: z.string().describe("Secret value (will be PUT to Cloudflare)."),
	type: workerSecretTypeSchema
		.optional()
		.describe(
			"Cloudflare secret type. `secret_text` (default) for plain strings; `secret_key` for cryptographic key material.",
		),
});
export type CfbSetSecretInput = z.infer<typeof cfbSetSecretInputSchema>;

export const cfbSetSecretOutputSchema = workerSecretBindingSchema;
export type CfbSetSecretOutput = z.infer<typeof cfbSetSecretOutputSchema>;

export const cfbSetSecretTool = createTool({
	id: "cfb_set_secret",
	description:
		"Create or update a Cloudflare runtime secret on the Worker for the configured site. Overwrites the value if a secret with the same name already exists.",
	inputSchema: cfbSetSecretInputSchema,
	outputSchema: cfbSetSecretOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_SECRETS_RESOURCE_URI, visibility: ["app"] },
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
			"deco-sites/admin/actions/hosting/cfworkers-builds/secrets/set.ts",
			{
				sitename: site,
				name: context.name,
				value: context.value,
				...(context.type ? { type: context.type } : {}),
			},
			apiKey,
		)) as CfbSetSecretOutput;
	},
});

// ─── cfb_delete_secret ────────────────────────────────────────────────────────

export const cfbDeleteSecretInputSchema = z.object({
	name: z
		.string()
		.regex(NAME_REGEX, NAME_HINT)
		.describe("Secret name to remove."),
});
export type CfbDeleteSecretInput = z.infer<typeof cfbDeleteSecretInputSchema>;

export const cfbDeleteSecretOutputSchema = z.object({
	ok: z.literal(true),
	name: z.string(),
});
export type CfbDeleteSecretOutput = z.infer<typeof cfbDeleteSecretOutputSchema>;

export const cfbDeleteSecretTool = createTool({
	id: "cfb_delete_secret",
	description:
		"Permanently remove a Cloudflare runtime secret from the Worker for the configured site.",
	inputSchema: cfbDeleteSecretInputSchema,
	outputSchema: cfbDeleteSecretOutputSchema,
	_meta: {
		ui: { resourceUri: CFB_SECRETS_RESOURCE_URI, visibility: ["app"] },
	},
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		await callAdmin(
			"deco-sites/admin/actions/hosting/cfworkers-builds/secrets/delete.ts",
			{ sitename: site, name: context.name },
			apiKey,
		);
		return { ok: true as const, name: context.name };
	},
});
