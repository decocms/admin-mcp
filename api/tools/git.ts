import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

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

export const gitStatusTool = createTool({
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
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const gitDiffTool = createTool({
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
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const gitPublishTool = createTool({
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
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
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

export const gitDiscardTool = createTool({
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
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return callAdmin(
			"deco-sites/admin/actions/releases/git/discard.ts",
			{ site, env: context.env, filepaths: context.filepaths },
			apiKey,
		);
	},
});

// ─── git_checkout_branch ──────────────────────────────────────────────────────

export const gitCheckoutBranchInputSchema = z.object({
	env: z.string().describe("Environment name"),
	branchName: z
		.string()
		.describe(
			"Name of the new branch to create and check out from the current state",
		),
});
export type GitCheckoutBranchInput = z.infer<
	typeof gitCheckoutBranchInputSchema
>;

export const gitCheckoutBranchOutputSchema = z.object({
	branch: z.string(),
});
export type GitCheckoutBranchOutput = z.infer<
	typeof gitCheckoutBranchOutputSchema
>;

export const gitCheckoutBranchTool = (cfEnv: Env) =>
	createTool({
		id: "git_checkout_branch",
		description:
			"Create and check out a new git branch from the current state of a sandbox environment. Useful before opening a pull request so changes are pushed to a feature branch instead of main.",
		inputSchema: gitCheckoutBranchInputSchema,
		outputSchema: gitCheckoutBranchOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			return callAdmin(
				"deco-sites/admin/actions/releases/git/checkoutBranch.ts",
				{ site, env: context.env, branchName: context.branchName },
				apiKey,
			) as Promise<GitCheckoutBranchOutput>;
		},
	});

// ─── git_raw ──────────────────────────────────────────────────────────────────

export const gitRawInputSchema = z.object({
	env: z.string().describe("Environment name"),
	args: z
		.array(z.string())
		.describe(
			"Git arguments to run (e.g. ['branch', '-a'] or ['log', '--oneline', '-5']). Only safe, non-destructive subcommands are allowed.",
		),
});
export type GitRawInput = z.infer<typeof gitRawInputSchema>;

export const gitRawOutputSchema = z.object({
	result: z.string(),
});
export type GitRawOutput = z.infer<typeof gitRawOutputSchema>;

export const gitRawTool = (cfEnv: Env) =>
	createTool({
		id: "git_raw",
		description:
			"Run a safe git command on a sandbox environment. Allowed subcommands: checkout, branch, stash, tag, log, show, diff, merge, cherry-pick, format-patch, describe, shortlog, rev-parse, rev-list, ls-files, ls-tree, cat-file. Destructive flags (--force, --hard, --global, etc.) are blocked.",
		inputSchema: gitRawInputSchema,
		outputSchema: gitRawOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(cfEnv);
			return callAdmin(
				"deco-sites/admin/actions/releases/git/raw.ts",
				{ site, env: context.env, args: context.args },
				apiKey,
			) as Promise<GitRawOutput>;
		},
	});

// ─── fs_unlink ────────────────────────────────────────────────────────────────

export const fsUnlinkInputSchema = z.object({
	env: z.string().describe("Environment name"),
	filepath: z.string().describe("Path of the new/untracked file to delete"),
});
export type FsUnlinkInput = z.infer<typeof fsUnlinkInputSchema>;

export const fsUnlinkTool = createTool({
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
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		return callAdmin(
			"deco-sites/admin/actions/daemon/fs/unlink.ts",
			{ site, env: context.env, filepath: context.filepath },
			apiKey,
		);
	},
});
