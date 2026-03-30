import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { Env } from "../types/env.ts";

// ─── schemas ──────────────────────────────────────────────────────────────────

export const gitStatusFileSchema = z.object({
	path: z.string(),
	index: z.string(),
	working_dir: z.string(),
});

export const gitStatusSchema = z.object({
	not_added: z.array(z.string()),
	conflicted: z.array(z.string()),
	created: z.array(z.string()),
	deleted: z.array(z.string()),
	modified: z.array(z.string()),
	renamed: z.array(z.any()),
	files: z.array(gitStatusFileSchema),
	staged: z.array(z.string()),
	ahead: z.number(),
	behind: z.number(),
	current: z.string().nullable(),
	tracking: z.string().nullable(),
	detached: z.boolean(),
});

export type GitStatus = z.infer<typeof gitStatusSchema>;
export type GitStatusFile = z.infer<typeof gitStatusFileSchema>;

export const gitDiffSchema = z.object({
	from: z.string().nullable(),
	to: z.string().nullable(),
});

export type GitDiff = z.infer<typeof gitDiffSchema>;

export const gitPublishResultSchema = z.object({
	commit: z.string().optional(),
});

export type GitPublishResult = z.infer<typeof gitPublishResultSchema>;

// ─── git_status ───────────────────────────────────────────────────────────────

export const gitStatusInputSchema = z.object({
	env: z.string().describe("Environment name to get git status for"),
});
export type GitStatusInput = z.infer<typeof gitStatusInputSchema>;

export const gitStatusTool = (cfEnv: Env) =>
	createTool({
		id: "git_status",
		description:
			"Get the git status for a sandbox environment, showing modified, created, deleted, and untracked files compared to the main branch.",
		inputSchema: gitStatusInputSchema,
		outputSchema: gitStatusSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			return callAdmin(
				"deco-sites/admin/loaders/releases/git/status.ts",
				{ site, env: context.env },
				apiKey,
			) as Promise<GitStatus>;
		},
	});

// ─── git_diff ─────────────────────────────────────────────────────────────────

export const gitDiffInputSchema = z.object({
	env: z.string().describe("Environment name"),
});
export type GitDiffInput = z.infer<typeof gitDiffInputSchema>;

export const gitDiffResultSchema = z.object({
	diffs: z.record(
		z.string(),
		z.object({
			from: z.string().nullable(),
			to: z.string().nullable(),
		}),
	),
});
export type GitDiffResult = z.infer<typeof gitDiffResultSchema>;

const daemonGitDiffSchema = z.object({
	from: z.string().nullish(),
	to: z.string().nullish(),
});

function collectChangedPaths(status: GitStatus): string[] {
	const fromFiles = status.files
		.map((file) => file.path)
		.filter((path) => typeof path === "string" && path.length > 0);

	return [...new Set(fromFiles)];
}

export const gitDiffTool = (cfEnv: Env) =>
	createTool({
		id: "git_diff",
		description:
			"Get the before/after content of all changed files in an environment, relative to the main branch.",
		inputSchema: gitDiffInputSchema,
		outputSchema: gitDiffResultSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			const status = (await callAdmin(
				"deco-sites/admin/loaders/releases/git/status.ts",
				{ site, env: context.env },
				apiKey,
			)) as GitStatus;

			const paths = collectChangedPaths(status);
			const diffEntries = await Promise.all(
				paths.map(async (path) => {
					const rawDiff = await callAdmin(
						"deco-sites/admin/loaders/daemon/git/diff.ts",
						{ site, env: context.env, path },
						apiKey,
					);
					const parsed = daemonGitDiffSchema.parse(rawDiff);
					const diff = {
						from: parsed.from ?? null,
						to: parsed.to ?? null,
					};
					return [path, diff] as const;
				}),
			);

			return {
				diffs: Object.fromEntries(diffEntries),
			} as GitDiffResult;
		},
	});

// ─── git_publish ──────────────────────────────────────────────────────────────

export const gitPublishInputSchema = z.object({
	env: z.string().describe("Environment name to publish changes from"),
	message: z
		.string()
		.optional()
		.describe("Commit message (defaults to 'New release via deco admin')"),
});
export type GitPublishInput = z.infer<typeof gitPublishInputSchema>;

export const gitPublishTool = (cfEnv: Env) =>
	createTool({
		id: "git_publish",
		description:
			"Always ask user before use this tool.Publish changes from a sandbox environment to the main branch. This commits and pushes all local changes.",
		inputSchema: gitPublishInputSchema,
		outputSchema: gitPublishResultSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			return callAdmin(
				"deco-sites/admin/actions/releases/git/publish.ts",
				{ site, env: context.env, message: context.message },
				apiKey,
			) as Promise<GitPublishResult>;
		},
	});

// ─── git_discard ──────────────────────────────────────────────────────────────

export const gitDiscardInputSchema = z.object({
	env: z.string().describe("Environment name"),
	filepaths: z
		.array(z.string())
		.describe("File paths to discard (restore to last committed state)"),
});
export type GitDiscardInput = z.infer<typeof gitDiscardInputSchema>;

export const gitDiscardTool = (cfEnv: Env) =>
	createTool({
		id: "git_discard",
		description:
			"Discard changes to one or more files in an environment, restoring them to the last committed state.",
		inputSchema: gitDiscardInputSchema,
		outputSchema: z.unknown(),
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			return callAdmin(
				"deco-sites/admin/actions/releases/git/discard.ts",
				{ site, env: context.env, filepaths: context.filepaths },
				apiKey,
			);
		},
	});

// ─── fs_unlink ────────────────────────────────────────────────────────────────

export const fsUnlinkInputSchema = z.object({
	env: z.string().describe("Environment name"),
	filepath: z.string().describe("Path of the new/untracked file to delete"),
});
export type FsUnlinkInput = z.infer<typeof fsUnlinkInputSchema>;

export const fsUnlinkTool = (cfEnv: Env) =>
	createTool({
		id: "fs_unlink",
		description:
			"Delete a new (untracked) file from an environment's filesystem.",
		inputSchema: fsUnlinkInputSchema,
		outputSchema: z.unknown(),
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			return callAdmin(
				"deco-sites/admin/actions/daemon/fs/unlink.ts",
				{ site, env: context.env, filepath: context.filepath },
				apiKey,
			);
		},
	});
