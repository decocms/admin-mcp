import {
	ExternalLink,
	GitMerge,
	GitMergeIcon,
	GitPullRequest,
	Search,
} from "lucide-react";
import { useState } from "react";
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
	ListPullRequestsInput,
	ListPullRequestsOutput,
	PullRequest,
} from "../../../api/tools/pull-requests.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function labelColor(hex: string): string {
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "#000000" : "#ffffff";
}

// ─── PullRequestRow ───────────────────────────────────────────────────────────

function PullRequestRow({
	pr,
	onMerge,
}: {
	pr: PullRequest;
	onMerge: (number: number) => Promise<void>;
}) {
	const [mergeState, setMergeState] = useState<
		"idle" | "confirm" | "merging" | "merged" | "conflict" | "error"
	>("idle");
	const [mergeError, setMergeError] = useState<string>();

	const handleMergeClick = () => setMergeState("confirm");
	const handleMergeCancel = () => {
		setMergeState("idle");
		setMergeError(undefined);
	};

	const handleMergeConfirm = async () => {
		setMergeState("merging");
		setMergeError(undefined);
		try {
			await onMerge(pr.number);
			setMergeState("merged");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Merge failed";
			const isConflict =
				/conflict|405|409/i.test(msg) ||
				msg.toLowerCase().includes("merge conflict");
			if (isConflict) {
				setMergeState("conflict");
			} else {
				setMergeError(msg);
				setMergeState("error");
			}
		}
	};

	const isDraft = pr.draft ?? false;

	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors",
				mergeState === "merged" && "border-success/40 bg-success/5",
				mergeState === "conflict" && "border-warning/40 bg-warning/5",
				mergeState === "error" && "border-destructive/20",
				isDraft && "opacity-70",
			)}
		>
			{/* Top row: number + title */}
			<div className="flex items-start gap-3">
				<GitPullRequest
					className={cn(
						"w-4 h-4 mt-0.5 shrink-0",
						isDraft ? "text-muted-foreground" : "text-primary",
					)}
				/>
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-medium text-foreground leading-snug">
							{pr.title}
						</span>
						{isDraft && (
							<Badge variant="outline" className="text-xs h-5">
								Draft
							</Badge>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
						<span className="font-mono">#{pr.number}</span>
						{pr.user && (
							<a
								href={pr.user.html_url}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-1.5 hover:text-foreground transition-colors"
							>
								{pr.user.avatar_url && (
									<img
										src={pr.user.avatar_url}
										alt={pr.user.login}
										className="w-4 h-4 rounded-full"
									/>
								)}
								<span>{pr.user.login}</span>
							</a>
						)}
						{pr.head?.ref && (
							<>
								<span>·</span>
								<span className="font-mono truncate max-w-[160px]">
									{pr.head.ref}
								</span>
								{pr.base?.ref && (
									<>
										<span>→</span>
										<span className="font-mono">{pr.base.ref}</span>
									</>
								)}
							</>
						)}
						{pr.created_at && (
							<>
								<span>·</span>
								<span>{timeAgo(pr.created_at)}</span>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Labels */}
			{pr.labels && pr.labels.length > 0 && (
				<div className="flex flex-wrap gap-1.5 pl-7">
					{pr.labels.map((label) => (
						<span
							key={label.name}
							className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
							style={
								label.color
									? {
											backgroundColor: `#${label.color}`,
											color: labelColor(label.color),
										}
									: undefined
							}
						>
							{label.name}
						</span>
					))}
				</div>
			)}

			{/* Actions */}
			<div className="flex items-center gap-2 pl-7">
				{mergeState === "merged" ? (
					<span className="text-xs text-success font-medium">
						Merged successfully
					</span>
				) : mergeState === "conflict" ? (
					<>
						<span className="flex items-center gap-1.5 text-xs text-warning font-medium">
							<GitMergeIcon className="w-3.5 h-3.5 shrink-0" />
							Conflito de merge — resolva os conflitos antes de fazer merge
						</span>
						<a href={pr.html_url} target="_blank" rel="noreferrer">
							<Button
								variant="outline"
								size="sm"
								className="h-7 text-xs gap-1.5"
							>
								<ExternalLink className="w-3 h-3" />
								Abrir no GitHub
							</Button>
						</a>
					</>
				) : mergeState === "error" ? (
					<>
						<span className="text-xs text-destructive">{mergeError}</span>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-xs"
							onClick={handleMergeCancel}
						>
							Dismiss
						</Button>
					</>
				) : mergeState === "confirm" ? (
					<>
						<span className="text-xs text-muted-foreground">
							Merge #{pr.number}?
						</span>
						<Button
							variant="default"
							size="sm"
							className="h-7 text-xs gap-1.5"
							onClick={handleMergeConfirm}
						>
							<GitMerge className="w-3 h-3" />
							Confirm
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-xs"
							onClick={handleMergeCancel}
						>
							Cancel
						</Button>
					</>
				) : mergeState === "merging" ? (
					<>
						<span className="w-3.5 h-3.5 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
						<span className="text-xs text-muted-foreground">Merging…</span>
					</>
				) : (
					<>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-xs gap-1.5"
							onClick={handleMergeClick}
							disabled={isDraft}
						>
							<GitMerge className="w-3 h-3" />
							Merge
						</Button>
						<a href={pr.html_url} target="_blank" rel="noreferrer">
							<Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
								<ExternalLink className="w-3 h-3" />
								Open in GitHub
							</Button>
						</a>
					</>
				)}
			</div>
		</div>
	);
}

// ─── PullRequestsList ─────────────────────────────────────────────────────────

function PullRequestsList({
	initialPullRequests,
	site,
}: {
	initialPullRequests: PullRequest[];
	site: string;
}) {
	const app = useMcpApp();
	const [pullRequests, setPullRequests] =
		useState<PullRequest[]>(initialPullRequests);
	const [search, setSearch] = useState("");

	const filtered = search.trim()
		? pullRequests.filter(
				(pr) =>
					pr.title.toLowerCase().includes(search.toLowerCase()) ||
					String(pr.number).includes(search) ||
					(pr.user?.login ?? "").toLowerCase().includes(search.toLowerCase()) ||
					(pr.head?.ref ?? "").toLowerCase().includes(search.toLowerCase()),
			)
		: pullRequests;

	const handleMerge = async (pullRequestNumber: number) => {
		const result = await app?.callServerTool({
			name: "merge_pull_request",
			arguments: { pullRequestNumber },
		});
		if (result?.isError) {
			const text = result.content?.find((c) => c.type === "text");
			throw new Error(text?.type === "text" ? text.text : "Merge failed");
		}
		setPullRequests((prev) =>
			prev.filter((pr) => pr.number !== pullRequestNumber),
		);
	};

	return (
		<section className="flex flex-col gap-4 min-h-dvh">
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="text-base font-semibold">Pull Requests</h1>
					{site && (
						<p className="text-sm text-muted-foreground mt-0.5">{site}</p>
					)}
				</div>
				<Badge variant="secondary" className="text-xs shrink-0 mt-0.5">
					{pullRequests.length} open
				</Badge>
			</div>

			{/* Search */}
			{pullRequests.length > 3 && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Filter pull requests…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9 h-8 text-sm"
					/>
				</div>
			)}

			{/* List */}
			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
					<GitPullRequest className="w-8 h-8 opacity-30" />
					<p className="text-sm">
						{search
							? `No pull requests matching "${search}"`
							: "No open pull requests"}
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{filtered.map((pr) => (
						<PullRequestRow key={pr.number} pr={pr} onMerge={handleMerge} />
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
				<span className="text-sm">Fetching pull requests…</span>
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
							<div className="h-7 w-16 bg-muted animate-pulse rounded" />
							<div className="h-7 w-14 bg-muted animate-pulse rounded" />
							<div className="h-7 w-28 bg-muted animate-pulse rounded" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PullRequestsPage() {
	const state = useMcpState<ListPullRequestsInput, ListPullRequestsOutput>();

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
						<CardTitle className="text-base">Pull Requests</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Call the{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								list_pull_requests
							</Badge>{" "}
							tool to view open pull requests.
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
	const { pullRequests, site } = state.toolResult ?? {
		pullRequests: [],
		site: "",
	};

	console.log("pullRequests", pullRequests);

	return (
		<div className="p-5">
			<PullRequestsList initialPullRequests={pullRequests} site={site} />
		</div>
	);
}
