import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import { environmentSchema } from "./environments.ts";

export const RELEASES_RESOURCE_URI = "ui://mcp-app/releases";

// ─── schemas ──────────────────────────────────────────────────────────────────

export const commitAuthorSchema = z.object({
	name: z.string(),
	email: z.string(),
	timestamp: z.number(),
	timezoneOffset: z.number().optional(),
});

export const commitDataSchema = z.object({
	message: z.string(),
	tree: z.string().optional(),
	parent: z.array(z.string()).optional(),
	author: commitAuthorSchema,
	committer: commitAuthorSchema.optional(),
});

export const releaseCommitSchema = z.object({
	oid: z.string(),
	commit: commitDataSchema,
});

export type ReleaseCommit = z.infer<typeof releaseCommitSchema>;

// ─── list_releases ────────────────────────────────────────────────────────────

export const listReleasesInputSchema = z.object({
	depth: z
		.number()
		.optional()
		.default(50)
		.describe("Number of commits to fetch (default: 50)"),
});
export type ListReleasesInput = z.infer<typeof listReleasesInputSchema>;

export const listReleasesOutputSchema = z.object({
	commits: z.array(releaseCommitSchema),
	site: z.string(),
	productionSha: z
		.string()
		.optional()
		.describe("Current production commit SHA"),
});
export type ListReleasesOutput = z.infer<typeof listReleasesOutputSchema>;

export const listReleasesTool = createTool({
	id: "list_releases",
	description:
		"List the commit history (releases) for the configured deco.cx site. Shows each commit's SHA, message, author, and date. Use this to view the release history and optionally promote or revert a specific commit.",
	inputSchema: listReleasesInputSchema,
	outputSchema: listReleasesOutputSchema,
	_meta: { ui: { resourceUri: RELEASES_RESOURCE_URI } },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const depth = context.depth ?? 50;

		const [logData, infoData] = await Promise.all([
			callAdmin(
				"deco-sites/admin/loaders/releases/git/log.ts",
				{ site, depth, limit: depth },
				apiKey,
			) as Promise<{ commits: unknown[] }>,
			callAdmin(
				"deco-sites/admin/loaders/releases/git/info.ts",
				{ sitename: site },
				apiKey,
			).catch(() => null) as Promise<{ head?: string } | null>,
		]);

		const commits = (logData?.commits ?? [])
			.map((c) => {
				try {
					return releaseCommitSchema.parse(c);
				} catch {
					return null;
				}
			})
			.filter(Boolean) as ReleaseCommit[];

		return {
			commits,
			site,
			productionSha: infoData?.head ?? undefined,
		};
	},
});

// ─── promote_to_production ────────────────────────────────────────────────────

export const promoteToProductionInputSchema = z.object({
	commitSha: z
		.string()
		.describe("The full commit SHA to promote to production"),
});
export type PromoteToProductionInput = z.infer<
	typeof promoteToProductionInputSchema
>;

export const promoteToProductionOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	commitSha: z.string(),
	site: z.string(),
});
export type PromoteToProductionOutput = z.infer<
	typeof promoteToProductionOutputSchema
>;

export const promoteToProductionTool = createTool({
	id: "promote_to_production",
	description:
		"Emergency action: immediately deploy a specific commit SHA to production for the configured deco.cx site. This bypasses the normal release flow and deploys the given commit directly. Always confirm with the user before running this.",
	inputSchema: promoteToProductionInputSchema,
	outputSchema: promoteToProductionOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const resp = await callAdmin(
			"deco-sites/admin/actions/hosting/deploy.ts",
			{ sitename: site, commitSha: context.commitSha, provider: "gcp" },
			apiKey,
		);

		console.log("resp", resp);
		return {
			success: true,
			message: `Commit ${context.commitSha.slice(0, 7)} promoted to production successfully.`,
			commitSha: context.commitSha,
			site,
		};
	},
});

// ─── revert_commit ────────────────────────────────────────────────────────────

export const revertCommitInputSchema = z.object({
	commitSha: z.string().describe("The full commit SHA to revert"),
	commitMessage: z
		.string()
		.describe("The commit message (used for branch and PR naming)"),
});
export type RevertCommitInput = z.infer<typeof revertCommitInputSchema>;

export const revertCommitOutputSchema = z.object({
	pullRequestUrl: z.string(),
	pullRequestNumber: z.number(),
	message: z.string(),
	site: z.string(),
});
export type RevertCommitOutput = z.infer<typeof revertCommitOutputSchema>;

export const revertCommitTool = createTool({
	id: "revert_commit",
	description:
		"Create a revert pull request for a specific commit in the configured deco.cx site. Automatically provisions a temporary sandbox environment, creates a revert branch, pushes it, and opens a PR for team review. The sandbox is deleted after the PR is created.",
	inputSchema: revertCommitInputSchema,
	outputSchema: revertCommitOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const short = context.commitSha.slice(0, 7);
		const envName = `revert-${short}-${crypto.randomUUID().slice(0, 8)}`;
		const branchName = `revert/${short}-${crypto.randomUUID().slice(0, 8)}`;
		const firstLine = context.commitMessage.split("\n")[0].slice(0, 60);
		const prTitle = `Revert "${firstLine}"`;
		const prBody = `Reverts commit ${context.commitSha}\n\nThis PR was created automatically via the MCP Releases tool.`;

		// 1. Create a temporary transient sandbox env to use as workspace
		const created = (await callAdmin(
			"deco-sites/admin/actions/environments/create.ts",
			{ site, name: envName, platform: "sandbox" },
			apiKey,
		)) as z.infer<typeof environmentSchema>;

		// Wait for the sandbox daemon to be ready before running git commands
		if (created.url) {
			const deadline = Date.now() + 3 * 60_000;
			while (Date.now() < deadline) {
				try {
					const res = await fetch(created.url, { method: "GET" });
					if (res.ok) break;
				} catch {
					// not reachable yet
				}
				await new Promise((resolve) => setTimeout(resolve, 3_000));
			}
		}

		const env = created.name;

		try {
			// 2. Create and checkout a new branch in the env
			await callAdmin(
				"deco-sites/admin/actions/releases/git/checkoutBranch.ts",
				{ site, env, branchName },
				apiKey,
			);

			// 3. Run git revert on the env's daemon
			await callAdmin(
				"deco-sites/admin/actions/releases/git/raw.ts",
				{ site, env, args: ["revert", context.commitSha, "--no-edit"] },
				apiKey,
			);

			// 4. Push the revert branch
			await callAdmin(
				"deco-sites/admin/actions/releases/git/publish.ts",
				{ site, env, message: prTitle },
				apiKey,
			);

			// 5. Open a PR from the revert branch to main
			const raw = (await callAdmin(
				"deco-sites/admin/actions/github/createPullRequest.ts",
				{ site, title: prTitle, body: prBody, head: branchName, base: "main" },
				apiKey,
			)) as Record<string, unknown>;

			const pr = (raw?.number !== undefined ? raw : (raw?.data ?? raw)) as {
				number: number;
				html_url: string;
			};

			return {
				pullRequestUrl: pr.html_url,
				pullRequestNumber: pr.number,
				message: `Revert PR #${pr.number} opened: ${pr.html_url}`,
				site,
			};
		} finally {
			// Clean up the temporary env regardless of success or failure
			callAdmin(
				"deco-sites/admin/actions/environments/delete.ts",
				{ site, name: env },
				apiKey,
			).catch(() => null);
		}
	},
});
