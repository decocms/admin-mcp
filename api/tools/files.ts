import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig, getEnv } from "../lib/admin.ts";
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
	isPreviewSupported: z.boolean(),
});
export type FileExplorerOutput = z.infer<typeof fileExplorerOutputSchema>;

export const fileExplorerTool = createTool({
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
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const env = getEnv(ctx);
		const { site, apiKey } = getConfig(ctx);
		const tokenToDecode = env.MESH_REQUEST_CONTEXT?.token;
		const userEnvName = await getUserEnvName(tokenToDecode);

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

		let userEnvEntry = sandboxEnvs.find((e) => e.name === userEnvName) ?? null;

		if (!userEnvEntry) {
			try {
				const created = (await callAdmin(
					"deco-sites/admin/actions/environments/create.ts",
					{ site, name: userEnvName, platform: "sandbox" },
					apiKey,
				)) as z.infer<typeof environmentSchema>;
				userEnvEntry = created;
			} catch {
				// Creation failed — frontend will keep polling until the env is ready
			}
		}

		const productionUrl = `https://${site}.deco.site`;

		const response = await fetch(productionUrl);
		const status = response.status;

		return {
			site,
			userEnv: userEnvName,
			userEnvUrl: userEnvEntry?.url ?? null,
			productionUrl,
			path: context.path ?? "/",
			isPreviewSupported: status === 200,
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

export const listFilesTool = createTool({
	id: "list_files",
	description:
		"List all files currently available in a sandbox environment filesystem.",
	inputSchema: listFilesInputSchema,
	outputSchema: listFilesOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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
		metadata: z
			.object({
				kind: z.string().optional(),
				name: z.string().optional(),
				path: z.string().optional(),
				blockType: z.string().optional(),
				__resolveType: z.string().optional(),
			})
			.optional(),
	})
	.passthrough();
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;

export const readFileTool = createTool({
	id: "read_file",
	description:
		"Read the current content of a file from a sandbox environment filesystem.",
	inputSchema: readFileInputSchema,
	outputSchema: readFileOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const writeFileTool = createTool({
	id: "write_file",
	description:
		"Create or overwrite a file in a sandbox environment with the provided content.",
	inputSchema: writeFileInputSchema,
	outputSchema: writeFileOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const deleteFileTool = createTool({
	id: "delete_file",
	description:
		"Delete a file from a sandbox environment filesystem by its absolute path.",
	inputSchema: deleteFileInputSchema,
	outputSchema: deleteFileOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const grepFilesTool = createTool({
	id: "grep_files",
	description:
		"Search for text or patterns across files in a sandbox environment. Supports regex, include/exclude globs, and case sensitivity options.",
	inputSchema: grepFilesInputSchema,
	outputSchema: grepFilesOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const replaceInFileTool = createTool({
	id: "replace_in_file",
	description:
		"Replace specific content within a file using exact string matching. Supports multiple sequential replacements in a single call. Prefer this over write_file for surgical edits.",
	inputSchema: replaceInFileInputSchema,
	outputSchema: replaceInFileOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const updateJsonTool = createTool({
	id: "update_json",
	description:
		"Update a specific key inside a JSON file without rewriting the whole file. Supports nested key paths, array insertion/removal, and partial updates.",
	inputSchema: updateJsonInputSchema,
	outputSchema: updateJsonOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

// ─── create_page ──────────────────────────────────────────────────────────────

export const createPageInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	name: z.string().min(1).max(80).describe("Human-readable page name"),
	path: z
		.string()
		.regex(/^(\/[^/]*)*\/?$/, "Must be a valid URL path starting with /")
		.describe("Page URL path (e.g. '/example-path')"),
});
export type CreatePageInput = z.infer<typeof createPageInputSchema>;

export const createPageOutputSchema = z.object({
	key: z.string(),
	name: z.string(),
	path: z.string(),
	filePath: z.string(),
});
export type CreatePageOutput = z.infer<typeof createPageOutputSchema>;

export const createPageTool = createTool({
	id: "create_page",
	description:
		"Create a new blank page in a sandbox environment. Writes a website/pages/Page.tsx block to /.deco/blocks/.",
	inputSchema: createPageInputSchema,
	outputSchema: createPageOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const { env, name, path } = context;

		const id = `pages-${encodeURIComponent(name)}-${Math.floor(Math.random() * 1e6)}`;
		const filePath = `/.deco/blocks/${id}.json`;

		const newBlock = {
			name,
			path,
			sections: [],
			seo: { __resolveType: "website/sections/Seo/SeoV2.tsx" },
			__resolveType: "website/pages/Page.tsx",
		};

		const result = (await callAdmin(
			"deco-sites/admin/actions/daemon/fs/patchFile.ts",
			{
				site,
				env,
				filepath: filePath,
				fileContent: JSON.stringify(newBlock, null, 2),
				timestamp: Date.now(),
			},
			apiKey,
		)) as { success?: boolean; error?: string };

		if (result.error) {
			throw new Error(result.error);
		}

		return { key: id, name, path, filePath };
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

export const getPagesTool = createTool({
	id: "get_pages",
	description:
		"List all pages defined in a sandbox environment (reads /.deco/blocks/pages-* blocks).",
	inputSchema: getPagesInputSchema,
	outputSchema: getPagesOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site } = getConfig(ctx);

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

// ─── get_page_sections ────────────────────────────────────────────────────────

export type CmsVariant = {
	value: Record<string, unknown>;
	rule: Record<string, unknown>;
	label: string;
};

export type CmsSection = {
	index: number;
	resolveType: string;
	label: string;
	isLazy?: boolean;
	isHidden?: boolean;
	isSavedBlock?: boolean;
	savedBlockKey?: string;
	savedBlockFilePath?: string;
	resolvedResolveType?: string;
	isMultivariate?: boolean;
	variants?: CmsVariant[];
};

export const getPageSectionsInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	path: z.string().describe("Page path to look up (e.g. '/')"),
});
export type GetPageSectionsInput = z.infer<typeof getPageSectionsInputSchema>;

const cmsSectionItemSchema = z.object({
	index: z.number(),
	resolveType: z.string(),
	label: z.string(),
	isLazy: z.boolean().optional(),
	isHidden: z.boolean().optional(),
	isSavedBlock: z.boolean().optional(),
	savedBlockKey: z.string().optional(),
	savedBlockFilePath: z.string().optional(),
	resolvedResolveType: z.string().optional(),
	isMultivariate: z.boolean().optional(),
	variants: z
		.array(
			z.object({
				value: z.record(z.string(), z.unknown()),
				rule: z.record(z.string(), z.unknown()),
				label: z.string(),
			}),
		)
		.optional(),
});

export const getPageSectionsOutputSchema = z.object({
	site: z.string(),
	env: z.string(),
	pageKey: z.string(),
	filePath: z.string(),
	pageData: z.record(z.string(), z.unknown()),
	sections: z.array(cmsSectionItemSchema),
	pageVariants: z
		.array(
			z.object({
				label: z.string(),
				rule: z.record(z.string(), z.unknown()),
				sections: z.array(cmsSectionItemSchema),
			}),
		)
		.optional(),
});
export type GetPageSectionsOutput = z.infer<typeof getPageSectionsOutputSchema>;

export const getPageSectionsTool = createTool({
	id: "get_page_sections",
	description:
		"Get all sections of a page in a sandbox environment given the page path. Returns the full page data and a list of sections with labels derived from their __resolveType.",
	inputSchema: getPageSectionsInputSchema,
	outputSchema: getPageSectionsOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site } = getConfig(ctx);

		const consistentHash = (input: string) => {
			let hash = 0;
			for (let i = 0; i < input.length; i++) {
				hash = (hash << 5) - hash + input.charCodeAt(i);
				hash = hash & hash;
			}
			return Math.abs(hash).toString(36);
		};

		const envUrl = `https://sites-${site}--${consistentHash(context.env)}.decocdn.com`;

		const decofileRes = await fetch(`${envUrl}/.decofile`);
		if (!decofileRes.ok) {
			throw new Error(
				`Failed to fetch decofile: ${decofileRes.status} ${decofileRes.statusText}`,
			);
		}

		type Block = {
			__resolveType?: string;
			name?: string;
			path?: string;
			sections?: unknown[];
			[key: string]: unknown;
		};
		const decofile = (await decofileRes.json()) as Record<string, Block>;

		const normalizedPath = context.path.split("?")[0];

		const entry = Object.entries(decofile).find(([, block]) => {
			if (!block?.path) return false;
			const parts = (block.__resolveType ?? "").split("/");
			return parts.includes("pages") && block.path === normalizedPath;
		});

		if (!entry) {
			throw new Error(`No page found at path: ${normalizedPath}`);
		}

		const [pageKey, pageBlock] = entry;
		const filePath = `/.deco/blocks/${pageKey}.json`;

		const labelFromResolveType = (rt: string): string => {
			const parts = rt.split("/");
			const filename = parts[parts.length - 1];
			return filename.replace(/\.(tsx|ts|jsx|js)$/, "") || rt;
		};

		const capitalize = (s: string) =>
			s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

		const formatMatcher = (rule: Record<string, unknown>): string => {
			const rt = (rule.__resolveType as string) ?? "";

			const alwaysTypes = [
				"website/matchers/always.ts",
				"$live/matchers/MatchAlways.ts",
			];
			if (alwaysTypes.includes(rt) || rt === "") return "Always";

			switch (rt) {
				case "website/matchers/never.ts":
					return "Never";

				case "website/matchers/device.ts":
				case "$live/matchers/MatchDevice.ts": {
					const {
						mobile,
						tablet,
						desktop,
						devices: devList = [],
					} = rule as {
						mobile?: boolean;
						tablet?: boolean;
						desktop?: boolean;
						devices?: string[];
					};
					const devices = [...(devList as string[])];
					mobile && devices.push("Mobile");
					tablet && devices.push("Tablet");
					desktop && devices.push("Desktop");
					return devices.length > 0
						? devices.map(capitalize).join(" & ")
						: labelFromResolveType(rt);
				}

				case "website/matchers/date.ts":
				case "$live/matchers/MatchDate.ts": {
					const { start, end } = rule as {
						start?: string;
						end?: string;
					};
					if (!start && !end) return labelFromResolveType(rt);
					const fmt = new Intl.DateTimeFormat("en", {
						dateStyle: "medium",
						timeStyle: "short",
					});
					if (start && end) {
						try {
							return `${fmt.format(new Date(start))} → ${fmt.format(new Date(end))}`;
						} catch {
							return labelFromResolveType(rt);
						}
					}
					if (start) {
						try {
							return `From ${fmt.format(new Date(start))}`;
						} catch {
							return labelFromResolveType(rt);
						}
					}
					if (end) {
						try {
							return `Until ${fmt.format(new Date(end))}`;
						} catch {
							return labelFromResolveType(rt);
						}
					}
					return labelFromResolveType(rt);
				}

				case "website/matchers/random.ts":
				case "$live/matchers/MatchRandom.ts": {
					const { traffic } = rule as { traffic?: number };
					if (typeof traffic === "number") {
						return `${Math.ceil(traffic * 100)}% of sessions`;
					}
					return labelFromResolveType(rt);
				}

				case "website/matchers/host.ts":
				case "$live/matchers/MatchHost.ts": {
					const { includes, match } = rule as {
						includes?: string;
						match?: string;
					};
					const parts: string[] = [];
					includes && parts.push(includes);
					match && parts.push(match);
					return parts.length > 0
						? parts.join(" - ")
						: labelFromResolveType(rt);
				}

				case "website/matchers/pathname.ts": {
					const caseObj = rule.case as
						| { type?: string; pathname?: string }
						| undefined;
					const { type, pathname } = caseObj ?? {};
					if (type && pathname) return `Pathname ${type} ${pathname}`;
					return labelFromResolveType(rt);
				}

				case "website/matchers/location.ts":
				case "$live/matchers/MatchLocation.ts": {
					const { includeLocations, excludeLocations } = rule as {
						includeLocations?: Array<{
							city?: string;
							regionCode?: string;
							country?: string;
						}>;
						excludeLocations?: Array<{
							city?: string;
							regionCode?: string;
							country?: string;
						}>;
					};
					const fmtLoc = (loc: {
						city?: string;
						regionCode?: string;
						country?: string;
					}) =>
						[loc.city, loc.regionCode, loc.country].filter(Boolean).join(" - ");
					const first = includeLocations?.[0];
					if (first) {
						const rest = (includeLocations?.length ?? 0) - 1;
						return `${fmtLoc(first)}${rest > 0 ? ` +${rest}` : ""}`;
					}
					const firstEx = excludeLocations?.[0];
					if (firstEx) {
						const rest = (excludeLocations?.length ?? 0) - 1;
						return `Except ${fmtLoc(firstEx)}${rest > 0 ? ` +${rest}` : ""}`;
					}
					return "Any location";
				}

				case "website/matchers/multi.ts":
				case "$live/matchers/MatchMulti.ts": {
					const { matchers, op = "AND" } = rule as {
						matchers?: Array<Record<string, unknown>>;
						op?: string;
					};
					if (matchers && matchers.length > 0) {
						return matchers.map(formatMatcher).join(` ${op} `);
					}
					return labelFromResolveType(rt);
				}

				default:
					return labelFromResolveType(rt) || "Always";
			}
		};

		const LAZY_RESOLVE_SUFFIXES = [
			"website/sections/Rendering/Lazy.tsx",
			"website/sections/Rendering/SingleDeferred.tsx",
		];
		const isLazyResolveType = (rt: string) =>
			LAZY_RESOLVE_SUFFIXES.some((suffix) => rt.endsWith(suffix));

		const isSavedBlockRef = (rt: string) =>
			rt !== "" && !rt.includes("/") && rt in decofile;

		// ── Section parsing helper (closure over decofile + helpers) ──────
		const parseSectionsFromArray = (
			rawArr: unknown[],
		): { sections: CmsSection[]; resolvedSections: unknown[] } => {
			const resolvedSections: unknown[] = [];
			const sections: CmsSection[] = rawArr.map((s, idx) => {
				const sectionObj = s as {
					__resolveType?: string;
					section?: { __resolveType?: string };
				};
				const rt = sectionObj.__resolveType ?? "";
				const isLazy = isLazyResolveType(rt);

				if (!isLazy && isSavedBlockRef(rt)) {
					const resolvedBlock = decofile[rt] as Block;
					const resolvedRt = resolvedBlock?.__resolveType ?? rt;
					resolvedSections.push(sectionObj);
					return {
						index: idx,
						resolveType: rt,
						label: labelFromResolveType(resolvedRt) || `Section ${idx + 1}`,
						isLazy,
						isSavedBlock: true,
						savedBlockKey: rt,
						savedBlockFilePath: `/.deco/blocks/${rt}.json`,
						resolvedResolveType: resolvedRt,
						__resolvedData: resolvedBlock,
					};
				}

				// ── section-level multivariate flag detection ────────
				// Also handles lazy-wrapped multivariates: { __resolveType: Lazy, section: { __resolveType: flags/multivariate, variants: [...] } }
				const innerSectionObj = isLazy
					? (sectionObj.section as
							| {
									__resolveType?: string;
									variants?: Array<{
										value?: Record<string, unknown>;
										rule?: Record<string, unknown>;
									}>;
							  }
							| undefined)
					: undefined;
				const multivariateRt = isLazy
					? (innerSectionObj?.__resolveType ?? "")
					: rt;
				if (multivariateRt.includes("flags/multivariate")) {
					const mvObj = (isLazy ? innerSectionObj : sectionObj) as {
						__resolveType: string;
						variants?: Array<{
							value?: Record<string, unknown>;
							rule?: Record<string, unknown>;
						}>;
					};
					const rawVariants = Array.isArray(mvObj.variants)
						? mvObj.variants
						: [];

					// ── Hidden section: single variant with "never" matcher ──
					const NEVER_RESOLVE_TYPES = ["website/matchers/never.ts"];
					if (
						rawVariants.length === 1 &&
						NEVER_RESOLVE_TYPES.includes(
							(rawVariants[0].rule?.__resolveType as string) ?? "",
						)
					) {
						const innerValue = (rawVariants[0].value ?? {}) as Record<
							string,
							unknown
						>;
						let innerRt = (innerValue.__resolveType as string) ?? "";
						// If the inner value is a Lazy wrapper, use the nested section's resolveType
						const innerIsLazy = isLazyResolveType(innerRt);
						if (innerIsLazy) {
							const nestedSection = innerValue.section as
								| Record<string, unknown>
								| undefined;
							innerRt = (nestedSection?.__resolveType as string) ?? innerRt;
						}
						resolvedSections.push(sectionObj);
						return {
							index: idx,
							resolveType: rt,
							label: labelFromResolveType(innerRt) || `Section ${idx + 1}`,
							isHidden: true,
							isLazy: innerIsLazy,
						};
					}

					const variants: CmsVariant[] = rawVariants.map((v) => {
						const value = (v.value ?? {}) as Record<string, unknown>;
						const rule = (v.rule ?? {}) as Record<string, unknown>;
						return {
							value,
							rule,
							label: formatMatcher(rule),
						};
					});
					const firstValueRt = (
						rawVariants[0]?.value as Record<string, unknown> | undefined
					)?.__resolveType as string | undefined;
					const sectionLabel = firstValueRt
						? labelFromResolveType(firstValueRt)
						: "Section";
					resolvedSections.push(sectionObj);
					return {
						index: idx,
						resolveType: rt,
						label: `Variants of ${sectionLabel}`,
						isMultivariate: true,
						isLazy,
						variants,
					};
				}

				const effectiveRt = isLazy
					? (sectionObj.section?.__resolveType ?? rt)
					: rt;
				resolvedSections.push(sectionObj);
				return {
					index: idx,
					resolveType: rt,
					label: labelFromResolveType(effectiveRt) || `Section ${idx + 1}`,
					isLazy,
				};
			});
			return { sections, resolvedSections };
		};

		// ── Detect page-level multivariate sections ──────────────────────
		const sectionsField = pageBlock.sections;
		type PageVariantEntry = {
			label: string;
			rule: Record<string, unknown>;
			sections: CmsSection[];
		};

		let pageVariants: PageVariantEntry[] | undefined;
		let rawSections: unknown[];

		const isPageMultivariate =
			!Array.isArray(sectionsField) &&
			sectionsField !== null &&
			typeof sectionsField === "object" &&
			(
				(sectionsField as { __resolveType?: string }).__resolveType ?? ""
			).includes("flags/multivariate");

		if (isPageMultivariate) {
			const mvField = sectionsField as {
				variants?: Array<{
					value?: unknown[];
					rule?: Record<string, unknown>;
				}>;
			};
			const mvVariants = Array.isArray(mvField.variants)
				? mvField.variants
				: [];
			pageVariants = mvVariants.map((v) => {
				const varSections = Array.isArray(v.value) ? v.value : [];
				const rule = (v.rule ?? {}) as Record<string, unknown>;
				const label = formatMatcher(rule);
				const { sections } = parseSectionsFromArray(varSections);
				return { label, rule, sections };
			});
			// Default display: first variant's sections
			rawSections = Array.isArray(mvVariants[0]?.value)
				? (mvVariants[0].value as unknown[])
				: [];
		} else {
			rawSections = Array.isArray(sectionsField) ? sectionsField : [];
		}

		const { sections, resolvedSections } = parseSectionsFromArray(rawSections);

		// For page-multivariate pages, keep the raw multivariate object in
		// pageData so write-back via write_file preserves the correct structure.
		const pageDataWithResolved = isPageMultivariate
			? ({ ...pageBlock } as Record<string, unknown>)
			: ({ ...pageBlock, sections: resolvedSections } as Record<
					string,
					unknown
				>);

		return {
			site,
			env: context.env,
			pageKey,
			filePath,
			pageData: pageDataWithResolved,
			sections,
			...(pageVariants ? { pageVariants } : {}),
		};
	},
});

// ─── list_apps ────────────────────────────────────────────────────────────────

interface AdminAppEntry {
	name: string;
	title?: string;
	description?: string;
	logo?: string;
	category?: string;
	path?: string;
	vendor: {
		alias: string;
	};
}

export const listAppsInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
});
export type ListAppsInput = z.infer<typeof listAppsInputSchema>;

export const appEntrySchema = z.object({
	blockId: z.string(),
	name: z.string(),
	title: z.string(),
	description: z.string(),
	logo: z.string(),
	category: z.string(),
	vendor: z.string(),
	installed: z.boolean(),
	configPath: z.string(),
});
export type AppEntry = z.infer<typeof appEntrySchema>;

export const listAppsOutputSchema = z.object({
	site: z.string(),
	apps: z.array(appEntrySchema),
});
export type ListAppsOutput = z.infer<typeof listAppsOutputSchema>;

export const listAppsTool = createTool({
	id: "list_apps",
	description:
		"List all apps available for the site with their installed status and configuration paths.",
	inputSchema: listAppsInputSchema,
	outputSchema: listAppsOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);

		let registryApps: AdminAppEntry[] = [];
		try {
			const data = await callAdmin(
				"deco-sites/admin/loaders/apps/list.ts",
				{ sitename: site },
				apiKey,
			);
			registryApps = Array.isArray(data) ? (data as AdminAppEntry[]) : [];
		} catch {
			// proceed with empty list
		}

		const consistentHash = (input: string) => {
			let hash = 0;
			for (let i = 0; i < input.length; i++) {
				hash = (hash << 5) - hash + input.charCodeAt(i);
				hash = hash & hash;
			}
			return Math.abs(hash).toString(36);
		};

		const envUrl = `https://sites-${site}--${consistentHash(context.env)}.decocdn.com`;

		type DecoBlock = { __resolveType?: string; [key: string]: unknown };
		let decofile: Record<string, DecoBlock> = {};
		try {
			const res = await fetch(`${envUrl}/.decofile`);
			if (res.ok) {
				decofile = (await res.json()) as Record<string, DecoBlock>;
			}
		} catch {
			// proceed without decofile
		}

		// Blocks whose __resolveType path segment includes "apps" are app configs
		const installedKeys = new Set(
			Object.entries(decofile)
				.filter(([, block]) => {
					const parts = (block.__resolveType ?? "").split("/");
					return parts.includes("apps");
				})
				.map(([key]) => key.toLowerCase()),
		);

		const apps: AppEntry[] = registryApps.map((app) => {
			const vendor = app.vendor?.alias ?? "decohub";
			const blockId = `${vendor}-${app.name}`;
			const installed =
				installedKeys.has(blockId.toLowerCase()) ||
				installedKeys.has(app.name.toLowerCase());
			return {
				blockId,
				name: app.name,
				title: app.title ?? app.name,
				description: app.description ?? "",
				logo: app.logo ?? "",
				category: app.category ?? "Other",
				vendor,
				installed,
				configPath: `/.deco/blocks/${blockId}.json`,
			};
		});

		return { site, apps };
	},
});

// ─── install_app ──────────────────────────────────────────────────────────────

export const installAppInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	app: z.string().describe("App name (e.g. vtex)"),
	vendor: z.string().describe("Vendor alias (e.g. decohub)"),
});
export type InstallAppInput = z.infer<typeof installAppInputSchema>;

export const installAppOutputSchema = z.object({ success: z.boolean() });
export type InstallAppOutput = z.infer<typeof installAppOutputSchema>;

export const installAppTool = createTool({
	id: "install_app",
	description: "Install an app for the configured site.",
	inputSchema: installAppInputSchema,
	outputSchema: installAppOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		await callAdmin(
			"deco-sites/admin/actions/apps/install.ts",
			{
				site,
				env: context.env,
				locator: { app: context.app, vendor: context.vendor },
			},
			apiKey,
		);
		return { success: true };
	},
});

// ─── uninstall_app ────────────────────────────────────────────────────────────

export const uninstallAppInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	app: z.string().describe("App name (e.g. vtex)"),
	vendor: z.string().describe("Vendor alias (e.g. decohub)"),
});
export type UninstallAppInput = z.infer<typeof uninstallAppInputSchema>;

export const uninstallAppOutputSchema = z.object({ success: z.boolean() });
export type UninstallAppOutput = z.infer<typeof uninstallAppOutputSchema>;

export const uninstallAppTool = createTool({
	id: "uninstall_app",
	description: "Uninstall an app from the configured site.",
	inputSchema: uninstallAppInputSchema,
	outputSchema: uninstallAppOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		await callAdmin(
			"deco-sites/admin/actions/apps/uninstall.ts",
			{
				site,
				env: context.env,
				locator: { app: context.app, vendor: context.vendor },
			},
			apiKey,
		);
		return { success: true };
	},
});

// ─── list_sections ────────────────────────────────────────────────────────────

export const listSectionsInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
});
export type ListSectionsInput = z.infer<typeof listSectionsInputSchema>;

export const sectionEntrySchema = z.object({
	resolveType: z.string(),
	title: z.string(),
	description: z.string().optional(),
	/** True for saved/named global section instances from .decofile */
	isGlobal: z.boolean().optional(),
	/** Block ID used as __resolveType when inserting a global section */
	blockId: z.string().optional(),
	/** URL to a live preview of this section */
	previewUrl: z.string().optional(),
});
export type SectionEntry = z.infer<typeof sectionEntrySchema>;

export const listSectionsOutputSchema = z.object({
	sections: z.array(sectionEntrySchema),
});
export type ListSectionsOutput = z.infer<typeof listSectionsOutputSchema>;

export const listSectionsTool = createTool({
	id: "list_sections",
	description:
		"List all available section types (from live/_meta manifest) and saved global section instances (from .decofile). Used to populate the Add Section picker.",
	inputSchema: listSectionsInputSchema,
	outputSchema: listSectionsOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site } = getConfig(ctx);
		const empty = { sections: [] };

		const consistentHash = (input: string) => {
			let hash = 0;
			for (let i = 0; i < input.length; i++) {
				hash = (hash << 5) - hash + input.charCodeAt(i);
				hash = hash & hash;
			}
			return Math.abs(hash).toString(36);
		};

		const envUrl = `https://sites-${site}--${consistentHash(context.env)}.decocdn.com`;

		/** Build the deco.cx section preview URL for a given resolveType or blockId */
		const buildPreviewUrl = (blockIdOrResolveType: string): string => {
			const props = {
				sections: [{ __resolveType: "preview", block: blockIdOrResolveType }],
			};
			return (
				`${envUrl}/live/previews/website/pages/Page.tsx` +
				`?props=${encodeURIComponent(btoa(JSON.stringify(props)))}`
			);
		};

		try {
			// Fetch manifest + schema and .decofile in parallel
			const [metaRes, decofileRes] = await Promise.all([
				fetch(`${envUrl}/live/_meta`),
				fetch(`${envUrl}/.decofile`),
			]);
			if (!metaRes.ok) return empty;

			type RawSchema = Record<string, unknown>;
			const meta = (await metaRes.json()) as {
				manifest?: { blocks?: Record<string, Record<string, RawSchema>> };
				schema?: RawSchema;
			};

			const sectionBlocks = meta.manifest?.blocks?.["sections"] ?? {};
			const sectionTypeSet = new Set(Object.keys(sectionBlocks));
			const defs = (meta.schema?.$defs ??
				meta.schema?.definitions ??
				{}) as RawSchema;

			const resolveRef = (ref: string): RawSchema => {
				const key = ref.split("/").pop() ?? "";
				return (defs[key] as RawSchema | undefined) ?? {};
			};

			const getTitle = (schema: RawSchema, fallback: string): string => {
				if (typeof schema.title === "string") return schema.title;
				for (const key of ["allOf", "anyOf", "oneOf"] as const) {
					const arr = schema[key];
					if (!Array.isArray(arr)) continue;
					for (const part of arr as RawSchema[]) {
						const resolved =
							typeof part.$ref === "string" ? resolveRef(part.$ref) : part;
						if (typeof resolved.title === "string") return resolved.title;
					}
				}
				if (typeof schema.$ref === "string") {
					const resolved = resolveRef(schema.$ref);
					if (typeof resolved.title === "string") return resolved.title;
				}
				return (
					fallback
						.split("/")
						.pop()
						?.replace(/\.tsx?$/, "")
						.replace(/[-_]/g, " ")
						.replace(/\b\w/g, (c) => c.toUpperCase()) ?? fallback
				);
			};

			const getDescription = (schema: RawSchema): string | undefined => {
				if (typeof schema.description === "string") return schema.description;
				for (const key of ["allOf", "anyOf", "oneOf"] as const) {
					const arr = schema[key];
					if (!Array.isArray(arr)) continue;
					for (const part of arr as RawSchema[]) {
						const resolved =
							typeof part.$ref === "string" ? resolveRef(part.$ref) : part;
						if (typeof resolved.description === "string")
							return resolved.description;
					}
				}
				return undefined;
			};

			// ── Section types from manifest ──────────────────────────────────────
			const sectionTypes: SectionEntry[] = Object.entries(sectionBlocks)
				.filter(
					([rt]) =>
						!rt.toLowerCase().includes("lazy") &&
						!rt.toLowerCase().includes("deferred"),
				)
				.map(([rt, schema]) => ({
					resolveType: rt,
					title: getTitle(schema, rt),
					description: getDescription(schema),
					previewUrl: buildPreviewUrl(rt),
				}))
				.sort((a, b) => a.title.localeCompare(b.title));

			// ── Global sections from .decofile ───────────────────────────────────
			const globalSections: SectionEntry[] = [];
			if (decofileRes.ok) {
				type Block = {
					__resolveType?: string;
					name?: string;
					path?: string;
					[k: string]: unknown;
				};
				const decofile = (await decofileRes.json()) as Record<string, Block>;
				for (const [blockId, block] of Object.entries(decofile)) {
					const rt = block.__resolveType ?? "";
					// A global section is a block whose resolveType is a known section type
					// and that does NOT represent a page (no path property)
					if (!sectionTypeSet.has(rt)) continue;
					if (block.path) continue; // skip pages
					const schemaForType = sectionBlocks[rt] ?? {};
					const baseTitle = getTitle(schemaForType, rt);
					// Use the block's own name if set, otherwise fall back to blockId
					const label =
						typeof block.name === "string" && block.name
							? block.name
							: blockId
									.replace(/[-_]/g, " ")
									.replace(/\b\w/g, (c) => c.toUpperCase());
					globalSections.push({
						resolveType: rt,
						title: label,
						description: `Global • ${baseTitle}`,
						isGlobal: true,
						blockId,
						previewUrl: buildPreviewUrl(blockId),
					});
				}
				globalSections.sort((a, b) => a.title.localeCompare(b.title));
			}

			return { sections: [...globalSections, ...sectionTypes] };
		} catch {
			return empty;
		}
	},
});

// ─── list_matchers ────────────────────────────────────────────────────────────

export const listMatchersInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
});
export type ListMatchersInput = z.infer<typeof listMatchersInputSchema>;

export const matcherEntrySchema = z.object({
	resolveType: z.string(),
	title: z.string(),
	description: z.string().optional(),
	icon: z.string().optional(),
});
export type MatcherEntry = z.infer<typeof matcherEntrySchema>;

export const listMatchersOutputSchema = z.object({
	matchers: z.array(matcherEntrySchema),
});
export type ListMatchersOutput = z.infer<typeof listMatchersOutputSchema>;

export const listMatchersTool = createTool({
	id: "list_matchers",
	description:
		"List all available matcher/rule types from the live/_meta manifest. Used to populate the variant rule picker.",
	inputSchema: listMatchersInputSchema,
	outputSchema: listMatchersOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site } = getConfig(ctx);
		const empty = { matchers: [] };

		const consistentHash = (input: string) => {
			let hash = 0;
			for (let i = 0; i < input.length; i++) {
				hash = (hash << 5) - hash + input.charCodeAt(i);
				hash = hash & hash;
			}
			return Math.abs(hash).toString(36);
		};

		const envUrl = `https://sites-${site}--${consistentHash(context.env)}.decocdn.com`;

		try {
			const metaRes = await fetch(`${envUrl}/live/_meta`);
			if (!metaRes.ok) return empty;

			type RawSchema = Record<string, unknown>;
			const meta = (await metaRes.json()) as {
				manifest?: { blocks?: Record<string, Record<string, RawSchema>> };
				schema?: RawSchema;
			};

			const matcherBlocks = meta.manifest?.blocks?.["matchers"] ?? {};
			const defs = (meta.schema?.$defs ??
				meta.schema?.definitions ??
				{}) as RawSchema;

			const resolveRef = (ref: string): RawSchema => {
				const key = ref.split("/").pop() ?? "";
				return (defs[key] as RawSchema | undefined) ?? {};
			};

			const getTitle = (schema: RawSchema, fallback: string): string => {
				if (typeof schema.title === "string") return schema.title;
				for (const key of ["allOf", "anyOf", "oneOf"] as const) {
					const arr = schema[key];
					if (!Array.isArray(arr)) continue;
					for (const part of arr as RawSchema[]) {
						const resolved =
							typeof part.$ref === "string" ? resolveRef(part.$ref) : part;
						if (typeof resolved.title === "string") return resolved.title;
					}
				}
				if (typeof schema.$ref === "string") {
					const resolved = resolveRef(schema.$ref);
					if (typeof resolved.title === "string") return resolved.title;
				}
				return (
					fallback
						.split("/")
						.pop()
						?.replace(/\.tsx?$/, "")
						.replace(/[-_]/g, " ")
						.replace(/\b\w/g, (c) => c.toUpperCase()) ?? fallback
				);
			};

			const getDescription = (schema: RawSchema): string | undefined => {
				if (typeof schema.description === "string") return schema.description;
				if (typeof schema.$ref === "string") {
					const resolved = resolveRef(schema.$ref);
					if (typeof resolved.description === "string")
						return resolved.description;
				}
				for (const key of ["allOf", "anyOf", "oneOf"] as const) {
					const arr = schema[key];
					if (!Array.isArray(arr)) continue;
					for (const part of arr as RawSchema[]) {
						const resolved =
							typeof part.$ref === "string" ? resolveRef(part.$ref) : part;
						if (typeof resolved.description === "string")
							return resolved.description;
					}
				}
				return undefined;
			};

			const getIcon = (schema: RawSchema): string | undefined => {
				if (typeof schema.icon === "string") return schema.icon;
				for (const key of ["allOf", "anyOf", "oneOf"] as const) {
					const arr = schema[key];
					if (!Array.isArray(arr)) continue;
					for (const part of arr as RawSchema[]) {
						const resolved =
							typeof part.$ref === "string" ? resolveRef(part.$ref) : part;
						if (typeof resolved.icon === "string") return resolved.icon;
					}
				}
				if (typeof schema.$ref === "string") {
					const resolved = resolveRef(schema.$ref);
					if (typeof resolved.icon === "string") return resolved.icon;
				}
				return undefined;
			};

			const matchers: MatcherEntry[] = Object.entries(matcherBlocks)
				.map(([rt, schema]) => ({
					resolveType: rt,
					title: getTitle(schema, rt),
					description: getDescription(schema),
					icon: getIcon(schema),
				}))
				.sort((a, b) => a.title.localeCompare(b.title));

			return { matchers };
		} catch {
			return empty;
		}
	},
});

// ─── get_block_schema ─────────────────────────────────────────────────────────

// SchemaProperty is recursive: object-typed fields carry their own nested
// property map so the UI can do schema-driven rendering at every depth.
export interface SchemaProperty {
	type?: string;
	title?: string;
	description?: string;
	default?: unknown;
	enum?: unknown[];
	format?: string;
	/** Nested properties for object-type fields */
	properties?: Record<string, SchemaProperty>;
	/** Item schema for array-type fields */
	items?: SchemaProperty;
	/** Property name used as the display label for array items (from schema `titleBy`) */
	titleBy?: string;
	/**
	 * Present on "block-ref" fields — a union of multiple compatible block
	 * types (loaders, sections, etc.).  The UI renders a loader-selector
	 * instead of a flat merged form.
	 */
	anyOfRefs?: Array<{
		resolveType: string;
		title: string;
		description?: string;
	}>;
}

export const schemaPropertySchema: z.ZodType<SchemaProperty> = z.object({
	type: z.string().optional(),
	title: z.string().optional(),
	description: z.string().optional(),
	default: z.unknown().optional(),
	enum: z.array(z.unknown()).optional(),
	format: z.string().optional(),
	// Not deeply validated by Zod – typed via the interface above
	properties: z.record(z.string(), z.unknown()).optional(),
	items: z.unknown().optional(),
	titleBy: z.string().optional(),
}) as z.ZodType<SchemaProperty>;

export const getBlockSchemaInputSchema = z.object({
	env: z.string().describe("Sandbox environment name"),
	resolveType: z
		.string()
		.describe("The __resolveType value from the block JSON"),
});
export type GetBlockSchemaInput = z.infer<typeof getBlockSchemaInputSchema>;

export const getBlockSchemaOutputSchema = z.object({
	resolveType: z.string(),
	properties: z.record(z.string(), schemaPropertySchema),
});
export type GetBlockSchemaOutput = z.infer<typeof getBlockSchemaOutputSchema>;

export const getBlockSchemaTool = createTool({
	id: "get_block_schema",
	description:
		"Fetch the JSON schema for a block type from the site's /live/_meta endpoint. Returns all declared properties with their types and titles, including ones not present in the block's current JSON.",
	inputSchema: getBlockSchemaInputSchema,
	outputSchema: getBlockSchemaOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site } = getConfig(ctx);
		const empty = { resolveType: context.resolveType, properties: {} };

		const consistentHash = (input: string) => {
			let hash = 0;
			for (let i = 0; i < input.length; i++) {
				hash = (hash << 5) - hash + input.charCodeAt(i);
				hash = hash & hash;
			}
			return Math.abs(hash).toString(36);
		};

		const envUrl = `https://sites-${site}--${consistentHash(context.env)}.decocdn.com`;

		try {
			const metaRes = await fetch(`${envUrl}/live/_meta`);
			if (!metaRes.ok) return empty;

			type RawSchema = Record<string, unknown>;
			const meta = (await metaRes.json()) as {
				manifest?: { blocks?: Record<string, Record<string, RawSchema>> };
				schema?: RawSchema;
			};

			const globalSchema = meta.schema ?? {};
			const allBlockTypes = meta.manifest?.blocks ?? {};

			// Find the per-block schema for this resolveType across all block types
			let blockSchema: RawSchema = {};
			for (const blockTypeMap of Object.values(allBlockTypes)) {
				if (blockTypeMap[context.resolveType]) {
					blockSchema = blockTypeMap[context.resolveType];
					break;
				}
			}

			// Merge exactly as the admin SDK does: { ...schema, ...blockSchema }
			const merged: RawSchema = { ...globalSchema, ...blockSchema };

			// All $defs / definitions from the merged schema
			const defs = (merged.$defs ?? merged.definitions ?? {}) as Record<
				string,
				unknown
			>;

			const resolveRef = (ref: string): RawSchema => {
				const key = ref.split("/").pop() ?? "";
				return (defs[key] as RawSchema | undefined) ?? {};
			};

			// ── collectProps ──────────────────────────────────────────────────────
			// Recursively follow $ref / allOf / anyOf / oneOf and merge all
			// `properties` objects found.  seenRefs guards against cycles.
			const collectProps = (
				s: RawSchema,
				seenRefs: Set<string> = new Set(),
				depth: number = 0,
			): RawSchema => {
				if (depth > 5) return {};

				if (typeof s.$ref === "string") {
					const key = s.$ref.split("/").pop() ?? "";
					if (seenRefs.has(key)) return {};
					return collectProps(
						resolveRef(s.$ref),
						new Set([...seenRefs, key]),
						depth + 1,
					);
				}

				let props: RawSchema = {};

				if (s.properties && typeof s.properties === "object") {
					props = { ...props, ...(s.properties as RawSchema) };
				}

				for (const k of ["allOf", "anyOf", "oneOf"] as const) {
					const arr = (s as Record<string, unknown>)[k];
					if (!Array.isArray(arr)) continue;
					for (const part of arr as RawSchema[]) {
						props = { ...props, ...collectProps(part, seenRefs, depth + 1) };
					}
				}

				return props;
			};

			// ── buildProperty ─────────────────────────────────────────────────────
			// Converts a raw schema entry into a typed SchemaProperty, resolving
			// nested properties for object types (up to depth 3).
			const buildProperty = (
				v: RawSchema,
				depth: number = 0,
			): SchemaProperty => {
				// Follow a direct $ref so we read the real schema object
				let resolved = v;
				if (typeof v.$ref === "string") {
					resolved = resolveRef(v.$ref);
				}

				// ── Pre-extract enum values from anyOf/oneOf const/enum branches ─────
				// TypeScript string/number unions compile to either:
				//   { "anyOf": [{ "const": "X" }, { "const": "Y" }] }       — const form
				//   { "anyOf": [{ "enum": ["X"] }, { "enum": ["Y"] }] }     — enum form
				// resolved.type is often already "string" so we'd never enter the anyOf
				// branch — extract enum values here so they survive regardless.
				let enumFromConsts: unknown[] | undefined;
				{
					const unionArr = (resolved.anyOf ?? resolved.oneOf) as
						| RawSchema[]
						| undefined;
					if (Array.isArray(unionArr)) {
						const nonNullUnion = unionArr.filter(
							(a) => !(a.type === "null" || a.type === null),
						);
						// Helper: extract the scalar value from a branch (const or single-element enum)
						const getScalar = (a: RawSchema): unknown => {
							if (typeof a.const === "string" || typeof a.const === "number")
								return a.const;
							if (
								Array.isArray(a.enum) &&
								a.enum.length === 1 &&
								(typeof a.enum[0] === "string" || typeof a.enum[0] === "number")
							)
								return a.enum[0];
							return undefined;
						};
						if (
							nonNullUnion.length > 0 &&
							nonNullUnion.every((a) => getScalar(a) !== undefined)
						) {
							enumFromConsts = nonNullUnion.map((a) => getScalar(a));
						}
					}
				}

				// Determine scalar type
				let type: string | undefined;
				if (resolved.type) {
					type = Array.isArray(resolved.type)
						? String(resolved.type[0])
						: String(resolved.type);
				} else if (typeof v.$ref === "string") {
					type = "object";
				} else if (resolved.anyOf || resolved.allOf || resolved.oneOf) {
					const arr = (resolved.anyOf ??
						resolved.allOf ??
						resolved.oneOf) as RawSchema[];
					const nonNull = arr.filter(
						(a) => !(a.type === "null" || a.type === null),
					);

					if (nonNull.length === 0) {
						type = "null";
					} else if (nonNull.length === 1) {
						// Simple nullable wrapper – treat as the inner type
						const first = nonNull[0];
						type = first.type
							? Array.isArray(first.type)
								? String(first.type[0])
								: String(first.type)
							: typeof first.$ref === "string"
								? "object"
								: "string";
					} else {
						// ── const-only branches: TypeScript string/number enum ───────
						if (enumFromConsts) {
							return {
								type: "string",
								title:
									typeof resolved.title === "string"
										? resolved.title
										: undefined,
								description:
									typeof resolved.description === "string"
										? resolved.description
										: undefined,
								enum: enumFromConsts,
							};
						}

						// ── deco.cx inline loader branches ───────────────────────────
						// Pattern: { "type": "object", "properties": { "__resolveType": { "enum": ["..."] } }, ... }
						// This is how deco.cx encodes compatible loaders/blocks in a field's anyOf.
						const loaderBranches = nonNull.filter((a) => {
							const rtEnum = (
								(a.properties as RawSchema | undefined)?.__resolveType as
									| RawSchema
									| undefined
							)?.enum;
							return Array.isArray(rtEnum) && typeof rtEnum[0] === "string";
						});
						if (loaderBranches.length > 0) {
							const anyOfRefs: Array<{
								resolveType: string;
								title: string;
								description?: string;
							}> = loaderBranches.map((branch) => {
								const rtEnum = (
									(branch.properties as RawSchema)?.__resolveType as RawSchema
								).enum as unknown[];
								const rt = String(rtEnum[0]);
								return {
									resolveType: rt,
									title:
										typeof branch.title === "string"
											? branch.title
											: (rt
													.split("/")
													.pop()
													?.replace(/\.tsx?$/, "")
													.replace(/[-_]/g, " ") ?? rt),
									description:
										typeof branch.description === "string"
											? branch.description
											: undefined,
								};
							});
							return {
								type: "block-ref",
								title:
									typeof resolved.title === "string"
										? resolved.title
										: undefined,
								description:
									typeof resolved.description === "string"
										? resolved.description
										: undefined,
								anyOfRefs,
							};
						}

						// ── all branches are $refs to block/loader defs ──────────────
						const allRefs = nonNull.every((a) => typeof a.$ref === "string");
						if (allRefs) {
							// Block-ref field: extract each option's resolveType + title
							const anyOfRefs: Array<{
								resolveType: string;
								title: string;
								description?: string;
							}> = [];
							for (const branch of nonNull) {
								const def = resolveRef(branch.$ref as string);
								// deco.cx embeds __resolveType as a const in allOf
								let rt: string | undefined;
								if (Array.isArray(def.allOf)) {
									for (const part of def.allOf as RawSchema[]) {
										const props = (part.properties ?? {}) as RawSchema;
										const rtProp = (props.__resolveType ?? {}) as RawSchema;
										const e = rtProp.enum;
										if (Array.isArray(e) && typeof e[0] === "string") {
											rt = e[0];
											break;
										}
									}
								}
								if (!rt) {
									// Fall back to the ref key
									rt = (branch.$ref as string).split("/").pop() ?? "";
								}
								anyOfRefs.push({
									resolveType: rt,
									title:
										typeof def.title === "string"
											? def.title
											: (rt
													.split("/")
													.pop()
													?.replace(/\.tsx?$/, "")
													.replace(/[-_]/g, " ") ?? rt),
									description:
										typeof def.description === "string"
											? def.description
											: undefined,
								});
							}
							return {
								type: "block-ref",
								title:
									typeof resolved.title === "string"
										? resolved.title
										: undefined,
								description:
									typeof resolved.description === "string"
										? resolved.description
										: undefined,
								anyOfRefs,
							};
						}
						// Mixed or scalar branches — fall through to generic "object"
						type = "object";
					}
				}

				// For object-type properties, recursively collect nested properties
				let nestedProperties: Record<string, SchemaProperty> | undefined;
				if (depth < 3) {
					const nestedRaw = collectProps(resolved);
					const nestedEntries = Object.entries(nestedRaw).filter(
						([k]) => !k.startsWith("__") && k !== "@type",
					);
					if (nestedEntries.length > 0) {
						nestedProperties = {};
						for (const [k, raw] of nestedEntries) {
							nestedProperties[k] = buildProperty(raw as RawSchema, depth + 1);
						}
					}
				}

				// For array-type properties, extract the item schema
				let itemsSchema: SchemaProperty | undefined;
				if ((type === "array" || resolved.type === "array") && depth < 3) {
					let rawItems = resolved.items as RawSchema | undefined;
					if (rawItems) {
						if (typeof rawItems.$ref === "string") {
							rawItems = resolveRef(rawItems.$ref);
						}
						itemsSchema = buildProperty(rawItems, depth + 1);
					}
				}

				return {
					type: type ?? "string",
					// Prefer the property-level title (v.title) over the resolved $ref
					// title (resolved.title). In deco.cx schemas, the JSDoc @title
					// annotation is placed on the property entry itself, not inside the
					// $defs object that the $ref points to.
					title:
						typeof v.title === "string"
							? v.title
							: typeof resolved.title === "string"
								? resolved.title
								: undefined,
					description:
						typeof v.description === "string"
							? v.description
							: typeof resolved.description === "string"
								? resolved.description
								: undefined,
					default: v.default ?? resolved.default,
					enum: Array.isArray(resolved.enum)
						? resolved.enum
						: (enumFromConsts ?? undefined),
					format:
						typeof resolved.format === "string" ? resolved.format : undefined,
					properties: nestedProperties,
					items: itemsSchema,
					titleBy:
						typeof resolved.titleBy === "string" ? resolved.titleBy : undefined,
				};
			};

			// Collect top-level properties and build typed map
			const topRaw = collectProps(merged);
			const properties: Record<string, SchemaProperty> = {};
			for (const [key, raw] of Object.entries(topRaw)) {
				if (key.startsWith("__") || key === "@type") continue;
				properties[key] = buildProperty(raw as RawSchema, 0);
			}

			return { resolveType: context.resolveType, properties };
		} catch {
			return empty;
		}
	},
});
