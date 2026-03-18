import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { Env } from "../types/env.ts";
import type { environmentSchema } from "./environments.ts";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
	try {
		const payloadB64 = token.split(".")[1];
		if (!payloadB64) return null;
		const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function getUserEnvName(apiKey: string): Promise<string> {
	const payload = decodeJwtPayload(apiKey);
	const userId =
		(payload?.user as Record<string, unknown> | undefined)?.id ??
		payload?.sub ??
		apiKey;
	console.log("userId", userId);
	const encoder = new TextEncoder();
	const data = encoder.encode(String(userId));
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${hashHex.slice(0, 8)}`;
}

export const FILE_EXPLORER_RESOURCE_URI = "ui://mcp-app/file-explorer";

function normalizeFilepath(filepath: string) {
	return filepath.startsWith("/") ? filepath : `/${filepath}`;
}

function normalizeFileList(data: unknown): string[] {
	if (Array.isArray(data)) {
		return data
			.filter((value): value is string => typeof value === "string")
			.map(normalizeFilepath)
			.sort((a, b) => a.localeCompare(b));
	}

	if (
		data &&
		typeof data === "object" &&
		"error" in data &&
		typeof data.error === "string"
	) {
		throw new Error(data.error);
	}

	throw new Error("Invalid file list response from admin");
}

const fileListSchema = z.array(z.string());

export const fileExplorerInputSchema = z.object({
	env: z
		.string()
		.optional()
		.describe("Sandbox environment name to open in the explorer"),
	path: z
		.string()
		.default("/")
		.describe("Initial directory path to focus in the explorer"),
});
export type FileExplorerInput = z.infer<typeof fileExplorerInputSchema>;

export const fileExplorerOutputSchema = z.object({
	site: z.string(),
	userEnv: z.string(),
	userEnvUrl: z.string().nullable(),
	productionUrl: z.string(),
	path: z.string(),
});
export type FileExplorerOutput = z.infer<typeof fileExplorerOutputSchema>;

export const fileExplorerTool = (env: Env) =>
	createTool({
		id: "file_explorer",
		description:
			"Browse and edit files in a sandbox environment for the configured deco.cx site. Optionally preselect an environment and initial path.",
		inputSchema: fileExplorerInputSchema,
		outputSchema: fileExplorerOutputSchema,
		_meta: { ui: { resourceUri: FILE_EXPLORER_RESOURCE_URI } },
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const tokenToDecode = env.MESH_REQUEST_CONTEXT?.token;
			const userEnvName = await getUserEnvName(tokenToDecode);
			console.log("userEnvName", userEnvName);

			const environmentsData = (await callAdmin(
				"deco-sites/admin/loaders/environments/list.ts",
				{ sitename: site },
				apiKey,
			)) as
				| z.infer<typeof environmentSchema>[]
				| { environments: z.infer<typeof environmentSchema>[] };
			const all = Array.isArray(environmentsData)
				? environmentsData
				: (environmentsData.environments ?? []);

			const sandboxEnvs = all.filter(
				(item) => item.platform === "sandbox",
			) as z.infer<typeof environmentSchema>[];

			let userEnvEntry =
				sandboxEnvs.find((e) => e.name === userEnvName) ?? null;

			if (!userEnvEntry) {
				try {
					console.log("userEnvName", userEnvName);
					const created = (await callAdmin(
						"deco-sites/admin/actions/environments/create.ts",
						{ site, name: userEnvName, platform: "sandbox" },
						apiKey,
					)) as z.infer<typeof environmentSchema>;
					console.log("CREATED", created);
					userEnvEntry = created;
				} catch {
					// Creation failed — frontend will keep polling until the env is ready
				}
			}

			const productionUrl = `https://${site}.deco.site`;

			return {
				site,
				userEnv: userEnvName,
				userEnvUrl: userEnvEntry?.url ?? null,
				productionUrl,
				path: context.path ?? "/",
			};
		},
	});

export const listFilesInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
});
export type ListFilesInput = z.infer<typeof listFilesInputSchema>;

export const listFilesOutputSchema = z.object({
	site: z.string(),
	env: z.string(),
	files: fileListSchema,
});
export type ListFilesOutput = z.infer<typeof listFilesOutputSchema>;

export const listFilesTool = (env: Env) =>
	createTool({
		id: "list_files",
		description:
			"List all files currently available in a sandbox environment filesystem.",
		inputSchema: listFilesInputSchema,
		outputSchema: listFilesOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const files = normalizeFileList(
				await callAdmin(
					"deco-sites/admin/loaders/daemon/fs/ls.ts",
					{ site, env: context.env },
					apiKey,
				),
			);

			return {
				site,
				env: context.env,
				files,
			};
		},
	});

export const readFileInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	filepath: z.string().describe("Absolute file path to read"),
});
export type ReadFileInput = z.infer<typeof readFileInputSchema>;

export const readFileOutputSchema = z
	.object({
		content: z.string().nullable(),
		timestamp: z.number().optional(),
	})
	.passthrough();
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;

export const readFileTool = (env: Env) =>
	createTool({
		id: "read_file",
		description:
			"Read the current content of a file from a sandbox environment filesystem.",
		inputSchema: readFileInputSchema,
		outputSchema: readFileOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const result = (await callAdmin(
				"deco-sites/admin/loaders/daemon/fs/read.ts",
				{
					site,
					env: context.env,
					filepath: normalizeFilepath(context.filepath),
				},
				apiKey,
			)) as ReadFileOutput;

			return result;
		},
	});

export const writeFileInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	filepath: z.string().describe("Absolute file path to write"),
	content: z.string().describe("Full file contents to persist"),
});
export type WriteFileInput = z.infer<typeof writeFileInputSchema>;

export const writeFileOutputSchema = z.object({
	success: z.boolean(),
	filepath: z.string(),
});
export type WriteFileOutput = z.infer<typeof writeFileOutputSchema>;

export const writeFileTool = (env: Env) =>
	createTool({
		id: "write_file",
		description:
			"Create or overwrite a file in a sandbox environment with the provided content.",
		inputSchema: writeFileInputSchema,
		outputSchema: writeFileOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const filepath = normalizeFilepath(context.filepath);
			const result = (await callAdmin(
				"deco-sites/admin/actions/daemon/fs/patchFile.ts",
				{
					site,
					env: context.env,
					filepath,
					fileContent: context.content,
					timestamp: Date.now(),
				},
				apiKey,
			)) as { success?: boolean; error?: string };

			if (result.error) {
				throw new Error(result.error);
			}

			return {
				success: !!result.success,
				filepath,
			};
		},
	});

export const deleteFileInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	filepath: z.string().describe("Absolute file path to delete"),
});
export type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;

export const deleteFileOutputSchema = z.object({
	success: z.boolean(),
	filepath: z.string(),
});
export type DeleteFileOutput = z.infer<typeof deleteFileOutputSchema>;

export const deleteFileTool = (env: Env) =>
	createTool({
		id: "delete_file",
		description:
			"Delete a file from a sandbox environment filesystem by its absolute path.",
		inputSchema: deleteFileInputSchema,
		outputSchema: deleteFileOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const filepath = normalizeFilepath(context.filepath);
			await callAdmin(
				"deco-sites/admin/actions/daemon/fs/unlink.ts",
				{
					site,
					env: context.env,
					filepath,
				},
				apiKey,
			);

			return {
				success: true,
				filepath,
			};
		},
	});

// ─── grep_files ───────────────────────────────────────────────────────────────

export const grepFilesInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	query: z.string().optional().describe("Text or regex pattern to search for"),
	filepath: z
		.string()
		.optional()
		.describe("Specific file path to search within. Omit to search all files."),
	includePattern: z
		.string()
		.optional()
		.describe("Glob pattern to include files (e.g. '*.ts')"),
	excludePattern: z
		.string()
		.optional()
		.describe("Glob pattern to exclude files"),
	caseInsensitive: z
		.boolean()
		.optional()
		.describe("Case insensitive search (default false)"),
	isRegex: z.boolean().optional().describe("Treat query as a regex pattern"),
	limit: z.number().optional().describe("Maximum number of results to return"),
});
export type GrepFilesInput = z.infer<typeof grepFilesInputSchema>;

export const grepFilesOutputSchema = z.unknown();
export type GrepFilesOutput = z.infer<typeof grepFilesOutputSchema>;

export const grepFilesTool = (env: Env) =>
	createTool({
		id: "grep_files",
		description:
			"Search for text or patterns across files in a sandbox environment. Supports regex, include/exclude globs, and case sensitivity options.",
		inputSchema: grepFilesInputSchema,
		outputSchema: grepFilesOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			return await callAdmin(
				"deco-sites/admin/loaders/daemon/fs/grep.ts",
				{
					site,
					env: context.env,
					filepath: context.filepath
						? normalizeFilepath(context.filepath)
						: undefined,
					query: context.query,
					includePattern: context.includePattern,
					excludePattern: context.excludePattern,
					caseInsensitive: context.caseInsensitive,
					isRegex: context.isRegex,
					limit: context.limit,
				},
				apiKey,
			);
		},
	});

// ─── replace_in_file ──────────────────────────────────────────────────────────

const replacementSchema = z.object({
	oldContent: z
		.string()
		.describe("The exact content to be replaced in the file"),
	newContent: z.string().describe("The content to replace oldContent with"),
	replaceAll: z
		.boolean()
		.optional()
		.describe(
			"Replace all occurrences instead of just the first (default false)",
		),
});

export const replaceInFileInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	filepath: z.string().describe("Absolute file path to modify"),
	replacements: z
		.array(replacementSchema)
		.describe("List of replacements to apply sequentially"),
});
export type ReplaceInFileInput = z.infer<typeof replaceInFileInputSchema>;

export const replaceInFileOutputSchema = z.object({
	success: z.boolean(),
	filepath: z.string(),
});
export type ReplaceInFileOutput = z.infer<typeof replaceInFileOutputSchema>;

export const replaceInFileTool = (env: Env) =>
	createTool({
		id: "replace_in_file",
		description:
			"Replace specific content within a file using exact string matching. Supports multiple sequential replacements in a single call. Prefer this over write_file for surgical edits.",
		inputSchema: replaceInFileInputSchema,
		outputSchema: replaceInFileOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			const filepath = normalizeFilepath(context.filepath);
			const result = (await callAdmin(
				"deco-sites/admin/actions/daemon/fs/replace.ts",
				{
					site,
					env: context.env,
					filepath,
					replacements: context.replacements,
					timestamp: Date.now(),
				},
				apiKey,
			)) as { success?: boolean; error?: string };

			if (result.error) {
				throw new Error(result.error);
			}

			return {
				success: !!result.success,
				filepath,
			};
		},
	});

// ─── update_json ──────────────────────────────────────────────────────────────

export const updateJsonInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	filepath: z.string().describe("Absolute path to the JSON file to update"),
	key: z
		.array(z.string())
		.describe(
			'Key path to update, e.g. ["sections", "3"] sets data[sections][3] = newValue',
		),
	newValue: z
		.string()
		.describe(
			"The new value as a JSON-stringified string. Pass the string 'undefined' to remove an array item.",
		),
	replaceOrAdd: z
		.enum(["replace", "add"])
		.default("replace")
		.describe(
			"Whether to replace the item at the key or insert at that array index",
		),
});
export type UpdateJsonInput = z.infer<typeof updateJsonInputSchema>;

export const updateJsonOutputSchema = z.unknown();
export type UpdateJsonOutput = z.infer<typeof updateJsonOutputSchema>;

export const updateJsonTool = (env: Env) =>
	createTool({
		id: "update_json",
		description:
			"Update a specific key inside a JSON file without rewriting the whole file. Supports nested key paths, array insertion/removal, and partial updates.",
		inputSchema: updateJsonInputSchema,
		outputSchema: updateJsonOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
			return await callAdmin(
				"deco-sites/admin/actions/decopilot/updateJson.ts",
				{
					site,
					env: context.env,
					filepath: normalizeFilepath(context.filepath),
					key: context.key,
					newValue: context.newValue,
					replaceOrAdd: context.replaceOrAdd,
				},
				apiKey,
			);
		},
	});

// ─── get_pages ────────────────────────────────────────────────────────────────

export type PageInfo = {
	key: string;
	name: string;
	path: string;
};

export const getPagesInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
});
export type GetPagesInput = z.infer<typeof getPagesInputSchema>;

export const getPagesOutputSchema = z.object({
	site: z.string(),
	env: z.string(),
	pages: z.array(
		z.object({
			key: z.string(),
			name: z.string(),
			path: z.string(),
		}),
	),
});
export type GetPagesOutput = z.infer<typeof getPagesOutputSchema>;

export const getPagesTool = (env: Env) =>
	createTool({
		id: "get_pages",
		description:
			"List all pages defined in a sandbox environment (reads /.deco/blocks/pages-* blocks).",
		inputSchema: getPagesInputSchema,
		outputSchema: getPagesOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site } = getConfig(env);

			// Mirror ENVIRONMENTS.consistentHash from admin/sdk/environments.ts
			const consistentHash = (input: string) => {
				let hash = 0;
				for (let i = 0; i < input.length; i++) {
					hash = (hash << 5) - hash + input.charCodeAt(i);
					hash = hash & hash;
				}
				return Math.abs(hash).toString(36);
			};

			// URL pattern: https://sites-{site}--{consistentHash(envName)}.decocdn.com
			const envUrl = `https://sites-${site}--${consistentHash(context.env)}.decocdn.com`;

			// Fetch the .decofile — same approach used by the admin SDK.
			// This is an object keyed by block ID with the full block content.
			const decofileRes = await fetch(`${envUrl}/.decofile`);
			if (!decofileRes.ok) {
				return { site, env: context.env, pages: [] };
			}

			type Block = {
				__resolveType?: string;
				name?: string;
				path?: string;
				[key: string]: unknown;
			};
			const decofile = (await decofileRes.json()) as Record<string, Block>;

			const pages: PageInfo[] = Object.entries(decofile)
				.filter(([, block]) => {
					if (!block?.path) return false;
					const parts = (block.__resolveType ?? "").split("/");
					return parts.includes("pages");
				})
				.map(([id, block]) => ({
					key: id,
					name: String(block.name ?? id),
					path: String(block.path ?? "/"),
				}))
				.sort((a, b) => a.path.localeCompare(b.path));

			return { site, env: context.env, pages };
		},
	});
