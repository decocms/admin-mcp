import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig, getEnv } from "../lib/admin.ts";
import { getUserEnvName } from "./files.ts";

export const ISSUES_RESOURCE_URI = "ui://mcp-app/issues";

// ─── shared schema ────────────────────────────────────────────────────────────

export const issueSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	labels: z.array(z.string()),
});

export type Issue = z.infer<typeof issueSchema>;

const issueCommentSchema = z.object({
	body: z.string(),
	user: z
		.object({
			login: z.string(),
			avatar_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	created_at: z.string(),
});

const issueDetailsSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string(),
	url: z.string(),
	labels: z.array(z.string()),
	user: z
		.object({
			login: z.string(),
			avatar_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	comments: z.array(issueCommentSchema),
});

export type IssueDetails = z.infer<typeof issueDetailsSchema>;

// ─── list_issues ──────────────────────────────────────────────────────────────

export const listIssuesInputSchema = z.object({});
export type ListIssuesInput = z.infer<typeof listIssuesInputSchema>;

export const listIssuesOutputSchema = z.object({
	issues: z.array(issueSchema),
	site: z.string(),
	userEnv: z.string(),
});
export type ListIssuesOutput = z.infer<typeof listIssuesOutputSchema>;

export const listIssuesTool = createTool({
	id: "list_issues",
	description:
		"List all open issues for the configured deco.cx site's GitHub repository. Returns issue title, number, labels, and GitHub URL.",
	inputSchema: listIssuesInputSchema,
	outputSchema: listIssuesOutputSchema,
	_meta: { ui: { resourceUri: ISSUES_RESOURCE_URI } },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const env = getEnv(ctx);
		const tokenToDecode = env.MESH_REQUEST_CONTEXT?.token;
		const userEnv = await getUserEnvName(tokenToDecode);
		const maxRetries = 3;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			const data = await callAdmin(
				"deco-sites/admin/loaders/github/getIssues.ts",
				{ site },
				apiKey,
			);
			const raw = Array.isArray(data) ? data : [];
			if (raw.length > 0 || attempt === maxRetries - 1) {
				const issues = raw.map((issue) => issueSchema.parse(issue));
				return { issues, site, userEnv };
			}
			await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
		}
		return { issues: [], site, userEnv };
	},
});

// ─── get_issue_details ────────────────────────────────────────────────────────

export const getIssueDetailsInputSchema = z.object({
	issueNumber: z.number().describe("The issue number to get details for"),
});
export type GetIssueDetailsInput = z.infer<typeof getIssueDetailsInputSchema>;

export const getIssueDetailsOutputSchema = z.object({
	issue: issueDetailsSchema,
	site: z.string(),
});
export type GetIssueDetailsOutput = z.infer<typeof getIssueDetailsOutputSchema>;

export const getIssueDetailsTool = createTool({
	id: "get_issue_details",
	description:
		"Get full details of a GitHub issue including body and comments. Used to gather context before fixing an issue.",
	inputSchema: getIssueDetailsInputSchema,
	outputSchema: getIssueDetailsOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const data = await callAdmin(
			"deco-sites/admin/loaders/github/getIssueDetails.ts",
			{ site, issueNumber: context.issueNumber },
			apiKey,
		);
		const issue = issueDetailsSchema.parse(data);
		return { issue, site };
	},
});
