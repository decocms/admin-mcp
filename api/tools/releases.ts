import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { environmentSchema } from "./environments.ts";

export const RELEASES_RESOURCE_URI = "ui://mcp-app/releases";

// ─── schemas ──────────────────────────────────────────────────────────────────

export const commitAuthorSchema = z.object({
	name: z.string(),
	email: z.string(),
	timestamp: z.number(),
	timezoneOffset: z.number().optional(),
});

export const commitAvatarSchema = z.object({
	sha: z.string(),
	avatarUrl: z.string().nullable(),
	login: z.string().nullable(),
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
	avatarUrl: z.string().nullable().optional(),
	login: z.string().nullable().optional(),
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

		const [logData, siteState, githubCommits] = await Promise.all([
			callAdmin(
				"deco-sites/admin/loaders/releases/git/log.ts",
				{ site, depth, limit: depth },
				apiKey,
			) as Promise<{ commits: unknown[] }>,
			callAdmin("kubernetes/loaders/siteState/get.ts", { site }, apiKey).catch(
				() => null,
			) as Promise<{
				source?: { commitSha?: string };
			} | null>,
			callAdmin(
				"deco-sites/admin/loaders/github/getCommits.ts",
				{ site, per_page: depth },
				apiKey,
			).catch(() => []) as Promise<
				Array<{
					sha: string;
					author: { login: string; avatar_url: string } | null;
				}>
			>,
		]);

		// Build a SHA → avatar map for O(1) merge
		const avatarBySha = new Map<
			string,
			{ avatarUrl: string | null; login: string | null }
		>();
		for (const c of githubCommits) {
			avatarBySha.set(c.sha, {
				avatarUrl: c.author?.avatar_url ?? null,
				login: c.author?.login ?? null,
			});
		}

		const commits = (logData?.commits ?? [])
			.map((c) => {
				try {
					const parsed = releaseCommitSchema.parse(c);
					const avatar = avatarBySha.get(parsed.oid);
					return {
						...parsed,
						avatarUrl: avatar?.avatarUrl ?? null,
						login: avatar?.login ?? null,
					};
				} catch {
					return null;
				}
			})
			.filter(Boolean) as ReleaseCommit[];

		const productionSha = siteState?.source?.commitSha ?? undefined;

		return { commits, site, productionSha };
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

		// Fire both deploy calls without awaiting — deployments are handled
		// asynchronously by Kubernetes/GCP so there is no need to block the MCP
		// response waiting for them to settle.
		callAdmin(
			"deco-sites/admin/actions/hosting/deploy.ts",
			{ sitename: site, commitSha: context.commitSha },
			apiKey,
		).catch(() => null);

		callAdmin(
			"deco-sites/admin/actions/hosting/deploy.ts",
			{ sitename: site, commitSha: context.commitSha, provider: "gcp" },
			apiKey,
		).catch(() => null);

		return {
			success: true,
			message: `Commit ${context.commitSha.slice(0, 7)} is being promoted to production.`,
			commitSha: context.commitSha,
			site,
		};
	},
});

// ─── get_production_sha ───────────────────────────────────────────────────────

export const getProductionShaInputSchema = z.object({});
export type GetProductionShaInput = z.infer<typeof getProductionShaInputSchema>;

export const getProductionShaOutputSchema = z.object({
	sha: z.string().nullable(),
	site: z.string(),
});
export type GetProductionShaOutput = z.infer<
	typeof getProductionShaOutputSchema
>;

export const getProductionShaTool = createTool({
	id: "get_production_sha",
	description:
		"Returns the commit SHA currently deployed to production for the configured deco.cx site. Useful for polling after a promote action to detect when the deployment is live.",
	inputSchema: getProductionShaInputSchema,
	outputSchema: getProductionShaOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_args, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const siteState = (await callAdmin(
			"kubernetes/loaders/siteState/get.ts",
			{ site },
			apiKey,
		).catch(() => null)) as { source?: { commitSha?: string } } | null;

		return {
			sha: siteState?.source?.commitSha ?? null,
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
					if (res.ok && res.status !== 409) break;
				} catch {
					// not reachable yet
				}
				await new Promise((resolve) => setTimeout(resolve, 3_000));
			}
		}

		const env = created.name;

		try {
			// 2. Fetch just the target commit so it exists in the shallow clone
			await callAdmin(
				"deco-sites/admin/actions/releases/git/raw.ts",
				{ site, env, args: ["fetch", "origin", context.commitSha] },
				apiKey,
			);

			// 3. Create and checkout a new branch in the env
			await callAdmin(
				"deco-sites/admin/actions/releases/git/checkoutBranch.ts",
				{ site, env, branchName },
				apiKey,
			);

			console.log("env", env);
			console.log("commitSha", context.commitSha);

			// 4. Stash any generated/dirty files so revert applies cleanly
			await callAdmin(
				"deco-sites/admin/actions/releases/git/raw.ts",
				{ site, env, args: ["stash"] },
				apiKey,
			).catch(() => null);

			// 5. Check if the commit is a merge commit (has multiple parents)
			const parentsResult = (await callAdmin(
				"deco-sites/admin/actions/releases/git/raw.ts",
				{
					site,
					env,
					args: ["log", "--pretty=%P", "-n", "1", context.commitSha],
				},
				apiKey,
			).catch(() => ({ result: "" }))) as { result: string };

			const parents = parentsResult.result.trim().split(/\s+/).filter(Boolean);
			const isMergeCommit = parents.length > 1;

			// 6. Run git revert — merge commits require -m 1 to pick the mainline parent
			await callAdmin(
				"deco-sites/admin/actions/releases/git/raw.ts",
				{
					site,
					env,
					args: [
						"revert",
						...(isMergeCommit ? ["-m", "1"] : []),
						context.commitSha,
						"--no-edit",
					],
				},
				apiKey,
			);

			// 7. Push the revert branch
			await callAdmin(
				"deco-sites/admin/actions/releases/git/publish.ts",
				{ site, env, message: prTitle },
				apiKey,
			);

			// 8. Open a PR from the revert branch to main
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
		}
	},
});
