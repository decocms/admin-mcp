import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { Env } from "../types/env.ts";
import { environmentSchema } from "./environments.ts";

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
	env: z.string().nullable(),
	path: z.string(),
	environments: z.array(environmentSchema),
	files: fileListSchema,
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
			const environments = all.filter((item) => item.platform === "sandbox");
			const selectedEnv = context.env ?? null;

			const files = selectedEnv
				? normalizeFileList(
						await callAdmin(
							"deco-sites/admin/loaders/daemon/fs/ls.ts",
							{ site, env: selectedEnv },
							apiKey,
						),
					)
				: [];

			return {
				site,
				env: selectedEnv,
				path: context.path ?? "/",
				environments,
				files,
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
