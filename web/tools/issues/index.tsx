import { CircleDot, ExternalLink, Loader2, Search, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	Issue,
	IssueDetails,
	ListIssuesInput,
	ListIssuesOutput,
} from "../../../api/tools/issues.ts";

// ─── IssueRow ─────────────────────────────────────────────────────────────────

function IssueRow({
	issue,
	onFix,
}: {
	issue: Issue;
	onFix: (issue: Issue) => Promise<void>;
}) {
	const [fixState, setFixState] = useState<"idle" | "loading">("idle");

	const handleFix = async () => {
		setFixState("loading");
		try {
			await onFix(issue);
		} finally {
			setFixState("idle");
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors">
			{/* Top row: number + title */}
			<div className="flex items-start gap-3">
				<CircleDot className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-medium text-foreground leading-snug">
							{issue.title}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
						<span className="font-mono">#{issue.number}</span>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2 pl-7">
				<Button
					variant="outline"
					size="sm"
					className="h-7 text-xs gap-1.5"
					onClick={handleFix}
					disabled={fixState === "loading"}
				>
					{fixState === "loading" ? (
						<Loader2 className="w-3 h-3 animate-spin" />
					) : (
						<Wrench className="w-3 h-3" />
					)}
					{fixState === "loading" ? "Loading context…" : "Fix it"}
				</Button>
				<a href={issue.url} target="_blank" rel="noreferrer">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs gap-1.5"
					>
						<ExternalLink className="w-3 h-3" />
						Open in GitHub
					</Button>
				</a>
			</div>
		</div>
	);
}

// ─── IssuesList ───────────────────────────────────────────────────────────────

function IssuesList({
	initialIssues,
	site,
	userEnv,
}: {
	initialIssues: Issue[];
	site: string;
	userEnv: string;
}) {
	const app = useMcpApp();
	const [search, setSearch] = useState("");

	useEffect(() => {
		if (!app) return;
		const parts = [];
		if (site) parts.push(`Current site: **${site}**`);
		parts.push(`Environment: **${userEnv}**`);
		app
			.updateModelContext({
				content:
					parts.length > 0 ? [{ type: "text", text: parts.join("\n\n") }] : [],
			})
			.catch(() => {});
		return () => {
			app.updateModelContext({ content: [] }).catch(() => {});
		};
	}, [app, userEnv, site]);

	const handleFix = async (issue: Issue) => {
		// Fetch full issue details (body + comments)
		const result = await app?.callServerTool({
			name: "get_issue_details",
			arguments: { issueNumber: issue.number },
		});

		let body = "";
		let comments: IssueDetails["comments"] = [];

		if (result && !result.isError) {
			const data = result.structuredContent as
				| { issue: IssueDetails }
				| undefined;
			if (data?.issue) {
				body = data.issue.body;
				comments = data.issue.comments;
			}
		}

		const commentsText =
			comments.length > 0
				? `\n\nComments:\n${comments.map((c) => `- @${c.user?.login ?? "unknown"}: ${c.body}`).join("\n")}`
				: "";

		app?.sendMessage({
			role: "user",
			content: [
				{
					type: "text",
					text: `Fix GitHub issue #${issue.number}: ${issue.title}\n\n${issue.url}\n\n${body}${commentsText}\n\nPlease analyze this issue, implement the necessary changes, and open a pull request with the fix.`,
				},
			],
		});
	};

	const filtered = search.trim()
		? initialIssues.filter(
				(issue) =>
					issue.title.toLowerCase().includes(search.toLowerCase()) ||
					String(issue.number).includes(search) ||
					issue.labels.some((l) =>
						l.toLowerCase().includes(search.toLowerCase()),
					),
			)
		: initialIssues;

	return (
		<section className="flex flex-col gap-4 min-h-dvh">
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="text-base font-semibold">Issues</h1>
					{site && (
						<p className="text-sm text-muted-foreground mt-0.5">{site}</p>
					)}
				</div>
				<Badge variant="secondary" className="text-xs shrink-0 mt-0.5">
					{initialIssues.length} open
				</Badge>
			</div>

			{/* Search */}
			{initialIssues.length > 3 && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Filter issues…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9 h-8 text-sm"
					/>
				</div>
			)}

			{/* List */}
			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
					<CircleDot className="w-8 h-8 opacity-30" />
					<p className="text-sm">
						{search
							? `No issues matching "${search}"`
							: "No open issues"}
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{filtered.map((issue) => (
						<IssueRow key={issue.number} issue={issue} onFix={handleFix} />
					))}
				</div>
			)}
		</section>
	);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
				<span className="text-sm">Fetching issues…</span>
			</div>
			<div className="flex flex-col gap-2">
				{["skeleton-0", "skeleton-1", "skeleton-2"].map((key) => (
					<div
						key={key}
						className="rounded-lg border border-border p-4 flex flex-col gap-2"
					>
						<div className="flex gap-3">
							<div className="w-4 h-4 rounded bg-muted animate-pulse shrink-0" />
							<div className="flex-1 flex flex-col gap-1.5">
								<div className="h-3.5 bg-muted animate-pulse rounded w-3/4" />
								<div className="h-3 bg-muted animate-pulse rounded w-1/2" />
							</div>
						</div>
						<div className="flex gap-2 pl-7">
							<div className="h-7 w-28 bg-muted animate-pulse rounded" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IssuesPage() {
	const state = useMcpState<ListIssuesInput, ListIssuesOutput>();

	if (state.status === "initializing") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
					<span className="text-sm">Connecting to host…</span>
				</div>
			</div>
		);
	}

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">Issues</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Call the{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								list_issues
							</Badge>{" "}
							tool to view open issues.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm border-destructive/40">
					<CardHeader>
						<CardTitle className="text-destructive text-base">Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							{state.error ?? "Unknown error"}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm">
					<CardContent className="pt-6">
						<p className="text-sm text-muted-foreground text-center">
							Tool call was cancelled.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return (
			<div className="p-5">
				<LoadingSkeleton />
			</div>
		);
	}

	// tool-result
	const { issues, site, userEnv } = state.toolResult ?? {
		issues: [],
		site: "",
		userEnv: "",
	};

	return (
		<div className="p-5">
			<IssuesList initialIssues={issues} site={site} userEnv={userEnv} />
		</div>
	);
}
