import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { GitStatus } from "./git.ts";

const daemonDiffSchema = z.object({
	from: z.string().nullish(),
	to: z.string().nullish(),
});

// ─── schemas ──────────────────────────────────────────────────────────────────

export const suggestCommitMessageInputSchema = z.object({
	env: z.string().describe("Environment name to generate suggestions for"),
});
export type SuggestCommitMessageInput = z.infer<
	typeof suggestCommitMessageInputSchema
>;

export const suggestCommitMessageOutputSchema = z.object({
	message: z.string().describe("Commit / publish message"),
	title: z.string().describe("Pull request title"),
	body: z.string().describe("Pull request body / description"),
	branch: z.string().describe("Suggested kebab-case branch name (no slashes)"),
});
export type SuggestCommitMessageOutput = z.infer<
	typeof suggestCommitMessageOutputSchema
>;

// ─── helpers ──────────────────────────────────────────────────────────────────

function toKebab(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 60);
}

function fallbackFromStatus(status: GitStatus): SuggestCommitMessageOutput {
	const all = [
		...status.created.map((f) => `add ${f}`),
		...status.modified.map((f) => `update ${f}`),
		...status.deleted.map((f) => `delete ${f}`),
		...status.not_added.map((f) => `add ${f}`),
	];

	const label = all.length > 0 ? all[0] : "update files";
	const extra = all.length > 1 ? ` and ${all.length - 1} more` : "";
	const message = `${label}${extra}`;

	return {
		message,
		title: message.charAt(0).toUpperCase() + message.slice(1),
		body: `Changes to ${[
			...status.modified,
			...status.created,
			...status.deleted,
			...status.not_added,
		]
			.slice(0, 5)
			.join(", ")}.`,
		branch: toKebab(label),
	};
}

// Returns a unified-diff-style string showing only changed lines ± context.
// Caps at MAX_LINES to protect against huge files.
function changedLines(
	from: string | null,
	to: string | null,
	{ context = 2, maxLines = 40 } = {},
): string {
	if (!from && !to) return "";
	if (!from)
		return (to ?? "")
			.split("\n")
			.slice(0, maxLines)
			.map((l) => `+ ${l}`)
			.join("\n");
	if (!to)
		return from
			.split("\n")
			.slice(0, maxLines)
			.map((l) => `- ${l}`)
			.join("\n");

	// Cap input to avoid O(n²) on huge files
	const a = from.split("\n").slice(0, 300);
	const b = to.split("\n").slice(0, 300);
	const n = a.length;
	const m = b.length;

	// LCS table
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array(m + 1).fill(0),
	);
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1] + 1
					: Math.max(dp[i - 1][j], dp[i][j - 1]);
		}
	}

	// Backtrack into edit ops
	type Op = { op: "=" | "+" | "-"; line: string };
	const ops: Op[] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
			ops.unshift({ op: "=", line: a[i - 1] });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			ops.unshift({ op: "+", line: b[j - 1] });
			j--;
		} else {
			ops.unshift({ op: "-", line: a[i - 1] });
			i--;
		}
	}

	// Collect indices near changes
	const show = new Set<number>();
	ops.forEach((op, idx) => {
		if (op.op !== "=") {
			for (
				let c = Math.max(0, idx - context);
				c <= Math.min(ops.length - 1, idx + context);
				c++
			) {
				show.add(c);
			}
		}
	});

	if (show.size === 0) return "";

	const result: string[] = [];
	let last = -1;
	for (const idx of [...show].sort((a, b) => a - b)) {
		if (last !== -1 && idx > last + 1) result.push("@@ ... @@");
		const { op, line } = ops[idx];
		result.push(`${op === "=" ? " " : op} ${line}`);
		last = idx;
		if (result.length >= maxLines) break;
	}

	return result.join("\n");
}

async function fetchDiffSummary(
	site: string,
	envName: string,
	apiKey: string,
	paths: string[],
): Promise<string> {
	const entries = await Promise.all(
		paths.map(async (path) => {
			try {
				const raw = await callAdmin(
					"deco-sites/admin/loaders/daemon/git/diff.ts",
					{ site, env: envName, path },
					apiKey,
				);
				const { from, to } = daemonDiffSchema.parse(raw);
				const diff = changedLines(from ?? null, to ?? null);
				return diff ? `${path}:\n${diff}` : path;
			} catch {
				return path;
			}
		}),
	);

	return entries.join("\n---\n");
}

interface CommitMetadata {
	branchName: string;
	title: string;
	body: string;
}

async function callAdminCommitMetadata(
	adminBaseUrl: string,
	site: string,
	apiKey: string,
	filesSummary: string,
): Promise<CommitMetadata | null> {
	const res = await fetch(`${adminBaseUrl}/api/chat/title`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify({
			sitename: site,
			mode: "commit",
			messages: [
				{
					role: "user",
					content: `Generate commit metadata for these site changes:\n${filesSummary}`,
				},
			],
		}),
	});

	if (!res.ok) return null;

	const data = (await res.json()) as Partial<CommitMetadata>;
	if (!data.branchName && !data.title) return null;
	return {
		branchName: data.branchName ?? "",
		title: data.title ?? "",
		body: data.body ?? "",
	};
}

// ─── tool ─────────────────────────────────────────────────────────────────────

export const suggestCommitMessageTool = createTool({
	id: "suggest_commit_message",
	description:
		"Use AI to suggest a commit message, PR title, PR body, and branch name based on the current changes in the environment.",
	inputSchema: suggestCommitMessageInputSchema,
	outputSchema: suggestCommitMessageOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);

		const status = (await callAdmin(
			"deco-sites/admin/loaders/releases/git/status.ts",
			{ site, env: context.env },
			apiKey,
		)) as GitStatus;

		console.log("status", status);

		const isGeneratedFile = (f: string) => /^static\/.*\.css$/.test(f);

		const changedFiles = [
			...status.modified,
			...status.created,
			...status.deleted,
			...status.not_added,
		].filter((f) => !isGeneratedFile(f));

		if (changedFiles.length === 0) {
			return {
				message: "No changes",
				title: "No changes",
				body: "",
				branch: "no-changes",
			};
		}

		// Fetch actual diff content for richer AI context
		const diffSummary = await fetchDiffSummary(
			site,
			context.env,
			apiKey,
			changedFiles,
		);

		const filesSummary = [
			...status.modified.map((f) => `Modified: ${f}`),
			...status.created.map((f) => `Added: ${f}`),
			...status.deleted.map((f) => `Deleted: ${f}`),
			...status.not_added.map((f) => `Added: ${f}`),
		].join("\n");

		const fullSummary = `${filesSummary}\n\nDiff snippets:\n${diffSummary}`;

		const adminBaseUrl = process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

		const meta = await callAdminCommitMetadata(
			adminBaseUrl,
			site,
			apiKey,
			fullSummary,
		).catch(() => null);

		if (!meta) {
			return fallbackFromStatus(status);
		}

		return {
			message: meta.title,
			title: meta.title,
			body: meta.body,
			branch: toKebab(meta.branchName || meta.title),
		};
	},
});
