import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

export const PULL_REQUESTS_RESOURCE_URI = "ui://mcp-app/pull-requests";

// ─── shared schema ────────────────────────────────────────────────────────────

export const pullRequestUserSchema = z.object({
	login: z.string(),
	avatar_url: z.string().optional(),
	html_url: z.string().optional(),
});

export const pullRequestSchema = z
	.object({
		number: z.number(),
		title: z.string(),
		body: z.string().nullable().optional(),
		html_url: z.string(),
		state: z.string(),
		draft: z.boolean().optional(),
		user: pullRequestUserSchema.nullable().optional(),
		head: z.object({ ref: z.string() }).optional(),
		base: z.object({ ref: z.string() }).optional(),
		created_at: z.string().optional(),
		updated_at: z.string().optional(),
		labels: z
			.array(
				z.object({
					name: z.string(),
					color: z.string().optional(),
				}),
			)
			.optional(),
		mergeable: z.boolean().nullable().optional(),
		mergeable_state: z.string().optional(),
		merged: z.boolean().optional(),
		merged_at: z.string().nullable().optional(),
	})
	.passthrough();

export type PullRequest = z.infer<typeof pullRequestSchema>;

// ─── list_pull_requests ───────────────────────────────────────────────────────

export const listPullRequestsInputSchema = z.object({});
export type ListPullRequestsInput = z.infer<typeof listPullRequestsInputSchema>;

export const listPullRequestsOutputSchema = z.object({
	pullRequests: z.array(pullRequestSchema),
	site: z.string(),
});
export type ListPullRequestsOutput = z.infer<
	typeof listPullRequestsOutputSchema
>;

export const listPullRequestsTool = createTool({
	id: "list_pull_requests",
	description:
		"List all open pull requests for the configured deco.cx site's GitHub repository. Returns PR title, author, branch, labels, and GitHub URL.",
	inputSchema: listPullRequestsInputSchema,
	outputSchema: listPullRequestsOutputSchema,
	_meta: { ui: { resourceUri: PULL_REQUESTS_RESOURCE_URI } },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { site, apiKey } = getConfig(ctx);

		// We need both open AND closed PRs to populate Done / Cancelled
		// columns. GitHub's REST list endpoint accepts state=open|closed|all,
		// but we don't know which params the admin loader honors. Strategy:
		//   1. Try `state: "all"` with a generous `per_page` (one call).
		//   2. If that gives us no closed PRs, fall back to an explicit
		//      closed-only call merged onto the open list.
		// Per-call failures are swallowed so a missing param shape never
		// breaks the whole list.
		async function fetchList(params: Record<string, unknown>) {
			try {
				const data = await callAdmin(
					"deco-sites/admin/loaders/github/getPullRequests.ts",
					{ site, ...params },
					apiKey,
				);
				return Array.isArray(data) ? data : [];
			} catch {
				return [];
			}
		}

		let raw: unknown[] = await fetchList({ state: "all", per_page: 50 });
		const hasClosed = raw.some(
			(pr) => (pr as { state?: string })?.state === "closed",
		);

		if (!hasClosed) {
			// Loader probably ignored `state: "all"`. Combine an explicit
			// open + closed call instead.
			const [openRaw, closedRaw] = await Promise.all([
				fetchList({ state: "open" }),
				fetchList({ state: "closed", per_page: 30 }),
			]);
			const seen = new Set<number>();
			const merged: unknown[] = [];
			for (const pr of [...openRaw, ...closedRaw]) {
				const n = (pr as { number?: unknown })?.number;
				if (typeof n !== "number" || seen.has(n)) continue;
				seen.add(n);
				merged.push(pr);
			}
			raw = merged;
		}

		// Debug: shows in API server log so we can see what the loader returns.
		console.log(
			`[list_pull_requests] site=${site} fetched=${raw.length}`,
			raw.slice(0, 3).map((p) => {
				const pr = p as {
					number?: number;
					state?: string;
					merged_at?: string | null;
					draft?: boolean;
				};
				return {
					n: pr.number,
					state: pr.state,
					merged_at: pr.merged_at,
					draft: pr.draft,
				};
			}),
		);

		// GitHub's /pulls list endpoint does NOT include `mergeable` /
		// `mergeable_state` — those are only computed on the single-PR
		// endpoint. Hydrate only OPEN, non-draft PRs (where mergeability
		// matters); merged/closed/draft are already terminal so we skip the
		// extra round-trip. Per-PR failures are non-fatal.
		const detailPaths = [
			"deco-sites/admin/loaders/github/getPullRequest.ts",
			"deco-sites/admin/loaders/github/getPullRequestDetails.ts",
		];
		async function fetchDetail(prNumber: number): Promise<unknown | null> {
			for (const path of detailPaths) {
				try {
					const detail = await callAdmin(
						path,
						{ site, pullRequestNumber: prNumber },
						apiKey,
					);
					if (detail && typeof detail === "object") return detail;
				} catch {
					// try next path
				}
			}
			return null;
		}

		const enriched = await Promise.all(
			raw.map(async (pr) => {
				if (
					!pr ||
					typeof pr !== "object" ||
					typeof (pr as { number?: unknown }).number !== "number"
				) {
					return pr;
				}
				const state = (pr as { state?: string }).state;
				const draft = (pr as { draft?: boolean }).draft;
				const merged = (pr as { merged?: boolean; merged_at?: string | null })
					.merged_at;
				if (state !== "open" || draft || merged) {
					return pr;
				}
				const number = (pr as { number: number }).number;
				const detail = await fetchDetail(number);
				return detail ? { ...(pr as object), ...(detail as object) } : pr;
			}),
		);

		const pullRequests = enriched.map((pr) => pullRequestSchema.parse(pr));
		return { pullRequests, site };
	},
});

// ─── merge_pull_request ───────────────────────────────────────────────────────

export const mergePullRequestInputSchema = z.object({
	pullRequestNumber: z.number().describe("The pull request number to merge"),
});
export type MergePullRequestInput = z.infer<typeof mergePullRequestInputSchema>;

export const mergePullRequestOutputSchema = z.object({
	merged: z.boolean(),
	message: z.string(),
	pullRequestNumber: z.number(),
	site: z.string(),
});
export type MergePullRequestOutput = z.infer<
	typeof mergePullRequestOutputSchema
>;

export const mergePullRequestTool = createTool({
	id: "merge_pull_request",
	description:
		"Merge a pull request by its number for the configured deco.cx site. Always confirm with the user before merging.",
	inputSchema: mergePullRequestInputSchema,
	outputSchema: mergePullRequestOutputSchema,
	_meta: { ui: { visibility: ["app"] } },
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		await callAdmin(
			"deco-sites/admin/actions/github/mergePullRequest.ts",
			{ site, pullRequestNumber: context.pullRequestNumber },
			apiKey,
		);
		return {
			merged: true,
			message: `Pull request #${context.pullRequestNumber} merged successfully.`,
			pullRequestNumber: context.pullRequestNumber,
			site,
		};
	},
});

// ─── open_pull_request ────────────────────────────────────────────────────────

export const openPullRequestInputSchema = z.object({
	env: z.string().describe("The environment name"),
	branch: z
		.string()
		.optional()
		.describe(
			"Branch name to create for the PR (defaults to the environment name)",
		),
	title: z.string().describe("Title for the pull request"),
	body: z
		.string()
		.optional()
		.describe("Description / body of the pull request"),
	base: z
		.string()
		.optional()
		.default("main")
		.describe("Target branch to merge into (defaults to 'main')"),
});
export type OpenPullRequestInput = z.infer<typeof openPullRequestInputSchema>;

export const openPullRequestOutputSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	site: z.string(),
	message: z.string(),
});
export type OpenPullRequestOutput = z.infer<typeof openPullRequestOutputSchema>;

export const openPullRequestTool = createTool({
	id: "open_pull_request",
	description:
		"Open a GitHub pull request from a sandbox environment. Creates a new branch from the environment's current changes, pushes it, and opens a PR to main.",
	inputSchema: openPullRequestInputSchema,
	outputSchema: openPullRequestOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const base = context.base ?? "main";
		const head = context.branch ?? context.env;

		// 1. Create and checkout a new branch on the env's daemon
		await callAdmin(
			"deco-sites/admin/actions/releases/git/checkoutBranch.ts",
			{ site, env: context.env, branchName: head },
			apiKey,
		);

		// 2. Publish (commit + push) to that new branch
		await callAdmin(
			"deco-sites/admin/actions/releases/git/publish.ts",
			{ site, env: context.env, message: context.title },
			apiKey,
		);

		// 3. Open the PR on GitHub from the env branch to base
		const raw = (await callAdmin(
			"deco-sites/admin/actions/github/createPullRequest.ts",
			{ site, title: context.title, body: context.body, head, base },
			apiKey,
		)) as Record<string, unknown>;

		// The admin action may return the PR directly or nested under `data`
		const pr = (raw?.number !== undefined ? raw : (raw?.data ?? raw)) as {
			number: number;
			title: string;
			html_url: string;
		};

		// 4. Checkout back to base so the environment isn't left on the PR branch
		await callAdmin(
			"deco-sites/admin/actions/releases/git/raw.ts",
			{ site, env: context.env, args: ["checkout", base] },
			apiKey,
		);

		return {
			number: pr.number,
			title: pr.title,
			html_url: pr.html_url,
			site,
			message: `Pull request #${pr.number} opened: ${pr.html_url}`,
		};
	},
});
