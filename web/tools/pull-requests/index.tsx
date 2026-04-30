import {
	AlertOctagon,
	ArrowUpRight,
	GitFork,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	LayoutGrid,
	List as ListIcon,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { ViewModeToggle } from "@/components/ui/view-mode-toggle.tsx";
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
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function stripMarkdown(s: string): string {
	return s
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]+`/g, " ")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*>\s+/gm, "")
		.replace(/[*_~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

// ─── status detection ─────────────────────────────────────────────────────────

type PrStatus =
	| "draft"
	| "ready"
	| "conflict"
	| "ci-failed"
	| "merged"
	| "closed"
	| "unknown";

function getPrStatus(pr: PullRequest): PrStatus {
	if (pr.merged || pr.merged_at) return "merged";
	if (pr.state === "closed") return "closed";
	if (pr.draft) return "draft";

	const mergeableState = (pr as PullRequest & { mergeable_state?: string })
		.mergeable_state;

	if (mergeableState === "dirty" || pr.mergeable === false) return "conflict";
	if (mergeableState === "blocked" || mergeableState === "unstable") {
		return "ci-failed";
	}
	if (mergeableState === "behind") return "conflict";
	if (mergeableState === "clean" || pr.mergeable === true) return "ready";
	return "unknown";
}

const STATUS_META: Record<
	PrStatus,
	{
		label: string;
		tooltip: string;
		Icon: typeof GitPullRequest;
		iconClass: string;
		dotClass: string;
	}
> = {
	ready: {
		label: "Ready",
		tooltip: "Ready to merge — no conflicts, checks passing",
		Icon: GitPullRequest,
		iconClass: "text-emerald-500",
		dotClass: "bg-emerald-500",
	},
	draft: {
		label: "Draft",
		tooltip: "Draft — still a work in progress",
		Icon: GitPullRequestDraft,
		iconClass: "text-muted-foreground",
		dotClass: "bg-muted-foreground/60",
	},
	conflict: {
		label: "Conflicts",
		tooltip: "Has conflicts — needs a rebase before it can merge",
		Icon: GitFork,
		iconClass: "text-amber-500",
		dotClass: "bg-amber-500",
	},
	"ci-failed": {
		label: "CI failed",
		tooltip: "CI failed — fix failing checks before merging",
		Icon: AlertOctagon,
		iconClass: "text-rose-500",
		dotClass: "bg-rose-500",
	},
	merged: {
		label: "Merged",
		tooltip: "Already merged",
		Icon: GitMerge,
		iconClass: "text-violet-500",
		dotClass: "bg-violet-500",
	},
	closed: {
		label: "Closed",
		tooltip: "Closed without merging",
		Icon: GitPullRequestClosed,
		iconClass: "text-rose-500",
		dotClass: "bg-rose-500",
	},
	unknown: {
		label: "Open",
		tooltip: "Open — mergeability not yet computed",
		Icon: GitPullRequest,
		iconClass: "text-sky-500",
		dotClass: "bg-sky-500",
	},
};

// ─── kanban groupings ─────────────────────────────────────────────────────────

type ViewMode = "list" | "kanban";

const KANBAN_COLUMNS: {
	id: string;
	label: string;
	statuses: PrStatus[];
	dotClass: string;
}[] = [
	{
		id: "in-progress",
		label: "In progress",
		statuses: ["draft"],
		dotClass: "bg-muted-foreground/60",
	},
	{
		id: "in-review",
		label: "In review",
		statuses: ["ready", "unknown", "conflict", "ci-failed"],
		dotClass: "bg-sky-500",
	},
	{
		id: "done",
		label: "Done",
		statuses: ["merged"],
		dotClass: "bg-emerald-500",
	},
	{
		id: "cancelled",
		label: "Cancelled",
		statuses: ["closed"],
		dotClass: "bg-rose-500/60",
	},
];

// ─── PullRequestCard ──────────────────────────────────────────────────────────

type MergeState =
	| "idle"
	| "confirm"
	| "merging"
	| "merged"
	| "conflict"
	| "error";

function PullRequestCard({
	pr,
	onMerge,
}: {
	pr: PullRequest;
	onMerge: (number: number) => Promise<void>;
}) {
	const [mergeState, setMergeState] = useState<MergeState>("idle");
	const [mergeError, setMergeError] = useState<string>();

	const status = getPrStatus(pr);
	const meta = STATUS_META[status];
	const StatusIcon = meta.Icon;

	const isActionable =
		status === "ready" || status === "unknown" || status === "conflict";

	const description = pr.body ? stripMarkdown(pr.body) : "";

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

	return (
		<div
			className={cn(
				"group flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20",
				mergeState === "merged" && "border-emerald-500/40 bg-emerald-500/5",
				mergeState === "conflict" && "border-amber-500/40 bg-amber-500/5",
				mergeState === "error" && "border-destructive/30",
			)}
		>
			{/* Top row: branch slug + status icon */}
			<div className="flex items-start justify-between gap-2">
				<span
					className="text-xs font-mono text-muted-foreground truncate"
					title={pr.head?.ref}
				>
					{pr.head?.ref ?? `#${pr.number}`}
				</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<span
							role="img"
							aria-label={meta.label}
							className="inline-flex shrink-0 cursor-default"
						>
							<StatusIcon
								className={cn("h-[18px] w-[18px]", meta.iconClass)}
								aria-hidden
							/>
						</span>
					</TooltipTrigger>
					<TooltipContent side="left" className="max-w-[240px] text-sm">
						<span className="font-medium">{meta.label}</span>
						<span className="block text-background/75 mt-0.5">
							{meta.tooltip}
						</span>
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Title */}
			<h3 className="text-[15px] font-medium text-foreground leading-snug line-clamp-2">
				{pr.title}
			</h3>

			{/* Description (truncated) */}
			{description && (
				<p className="text-sm text-muted-foreground leading-snug line-clamp-2">
					{description}
				</p>
			)}

			{/* Footer: [action #pr↗]  —  [user · time] */}
			<div className="mt-1 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					{mergeState === "merged" ? (
						<span className="text-sm font-medium text-emerald-500">Merged</span>
					) : mergeState === "conflict" ? (
						<a
							href={pr.html_url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex"
						>
							<Button
								variant="outline"
								size="sm"
								className="h-8 text-sm gap-1.5"
							>
								<GitFork className="w-3.5 h-3.5" />
								Resolve
							</Button>
						</a>
					) : mergeState === "error" ? (
						<>
							<Button
								variant="outline"
								size="sm"
								className="h-8 text-sm"
								onClick={handleMergeCancel}
							>
								Dismiss
							</Button>
							<span
								className="text-sm text-destructive truncate"
								title={mergeError}
							>
								{mergeError}
							</span>
						</>
					) : mergeState === "confirm" ? (
						<>
							<Button
								variant="default"
								size="sm"
								className="h-8 text-sm gap-1.5"
								onClick={handleMergeConfirm}
							>
								<GitMerge className="w-3.5 h-3.5" />
								Confirm merge
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-8 text-sm"
								onClick={handleMergeCancel}
							>
								Cancel
							</Button>
						</>
					) : mergeState === "merging" ? (
						<>
							<span className="w-3.5 h-3.5 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
							<span className="text-sm text-muted-foreground">Merging…</span>
						</>
					) : status === "conflict" ? (
						<a
							href={pr.html_url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex"
						>
							<Button
								variant="outline"
								size="sm"
								className="h-8 text-sm gap-1.5"
							>
								<GitFork className="w-3.5 h-3.5" />
								Resolve
							</Button>
						</a>
					) : status === "ci-failed" ? (
						<a
							href={pr.html_url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex"
						>
							<Button
								variant="outline"
								size="sm"
								className="h-8 text-sm gap-1.5"
							>
								<AlertOctagon className="w-3.5 h-3.5" />
								Fix CI
							</Button>
						</a>
					) : isActionable ? (
						<Button
							variant="outline"
							size="sm"
							className="h-8 text-sm gap-1.5"
							onClick={handleMergeClick}
						>
							<GitMerge className="w-3.5 h-3.5" />
							Merge
						</Button>
					) : (
						<span className="text-sm text-muted-foreground">{meta.label}</span>
					)}

					{/* PR # link to GitHub */}
					<a
						href={pr.html_url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-0.5 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0"
						title={`Open #${pr.number} on GitHub`}
					>
						<span>#{pr.number}</span>
						<ArrowUpRight className="w-3.5 h-3.5" />
					</a>
				</div>

				{/* Right: avatar · time */}
				{(pr.user || pr.updated_at || pr.created_at) && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
						{pr.user?.avatar_url && (
							<Tooltip>
								<TooltipTrigger asChild>
									<img
										src={pr.user.avatar_url}
										alt={pr.user.login}
										className="w-6 h-6 rounded-full shrink-0"
									/>
								</TooltipTrigger>
								<TooltipContent side="top">{pr.user.login}</TooltipContent>
							</Tooltip>
						)}
						{(pr.updated_at || pr.created_at) && (
							<span className="shrink-0">
								{timeAgo(pr.updated_at ?? pr.created_at ?? "")}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({
	label,
	count,
	dotClass,
	children,
}: {
	label: string;
	count: number;
	dotClass: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 w-[300px] shrink-0">
			<div className="flex items-center gap-2 px-1">
				<span
					className={cn("h-2 w-2 rounded-full shrink-0", dotClass)}
					aria-hidden
				/>
				<h2 className="text-[13px] font-medium text-muted-foreground/70 uppercase tracking-wide">
					{label}
				</h2>
				<span className="text-sm font-mono text-muted-foreground">{count}</span>
			</div>
			<div className="flex flex-col gap-2 min-h-[60px]">{children}</div>
		</div>
	);
}

// ─── PullRequestsList ─────────────────────────────────────────────────────────

function PullRequestsView({
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
	const [view, setView] = useState<ViewMode>("list");

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return pullRequests;
		return pullRequests.filter(
			(pr) =>
				pr.title.toLowerCase().includes(q) ||
				String(pr.number).includes(q) ||
				(pr.user?.login ?? "").toLowerCase().includes(q) ||
				(pr.head?.ref ?? "").toLowerCase().includes(q) ||
				(pr.body ?? "").toLowerCase().includes(q),
		);
	}, [pullRequests, search]);

	const grouped = useMemo(() => {
		const groups: Record<string, PullRequest[]> = {};
		for (const col of KANBAN_COLUMNS) groups[col.id] = [];
		for (const pr of filtered) {
			const status = getPrStatus(pr);
			const col = KANBAN_COLUMNS.find((c) => c.statuses.includes(status));
			if (col) groups[col.id].push(pr);
		}
		return groups;
	}, [filtered]);

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

	const isEmpty = filtered.length === 0;

	return (
		<section className="flex flex-col gap-6">
			{/* Title row: matches studio Page.Title (text-xl font-medium) */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h1 className="text-xl font-medium leading-tight">Reviews</h1>
					{site && (
						<p className="text-sm text-muted-foreground mt-1 truncate">
							{site}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<Badge variant="secondary" className="text-xs">
						{
							pullRequests.filter(
								(pr) => pr.state === "open" && !pr.merged && !pr.merged_at,
							).length
						}{" "}
						open
					</Badge>
					<ViewModeToggle<ViewMode>
						value={view}
						onValueChange={setView}
						options={[
							{
								value: "list",
								icon: <ListIcon />,
								tooltip: "List view",
							},
							{
								value: "kanban",
								icon: <LayoutGrid />,
								tooltip: "Kanban view",
							},
						]}
					/>
				</div>
			</div>

			{/* Search */}
			{pullRequests.length > 3 && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Filter by title, branch, author…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9 h-9 text-sm"
					/>
				</div>
			)}

			{/* Empty state */}
			{isEmpty ? (
				<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
					<GitPullRequest className="w-8 h-8 opacity-30" />
					<p className="text-sm">
						{search
							? `No pull requests matching "${search}"`
							: "No open pull requests"}
					</p>
				</div>
			) : view === "list" ? (
				<div className="flex flex-col gap-2">
					{filtered.map((pr) => (
						<PullRequestCard key={pr.number} pr={pr} onMerge={handleMerge} />
					))}
				</div>
			) : (
				<div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
					{KANBAN_COLUMNS.map((col) => {
						const items = grouped[col.id] ?? [];
						return (
							<KanbanColumn
								key={col.id}
								label={col.label}
								count={items.length}
								dotClass={col.dotClass}
							>
								{items.length === 0 ? (
									<div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center">
										<p className="text-sm text-muted-foreground">No PRs</p>
									</div>
								) : (
									items.map((pr) => (
										<PullRequestCard
											key={pr.number}
											pr={pr}
											onMerge={handleMerge}
										/>
									))
								)}
							</KanbanColumn>
						);
					})}
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
				<span className="text-sm">Fetching reviews…</span>
			</div>
			<div className="flex flex-col gap-2">
				{["skeleton-0", "skeleton-1", "skeleton-2"].map((key) => (
					<div
						key={key}
						className="rounded-lg border border-border p-4 flex flex-col gap-2.5"
					>
						<div className="flex items-center justify-between gap-2">
							<div className="h-3.5 bg-muted animate-pulse rounded w-36" />
							<div className="w-[18px] h-[18px] rounded bg-muted animate-pulse" />
						</div>
						<div className="h-4 bg-muted animate-pulse rounded w-3/4" />
						<div className="h-3.5 bg-muted animate-pulse rounded w-full" />
						<div className="flex items-center justify-between gap-2 mt-1">
							<div className="h-8 w-20 bg-muted animate-pulse rounded" />
							<div className="h-3.5 w-16 bg-muted animate-pulse rounded" />
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
						<CardTitle className="text-base">Reviews</CardTitle>
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
			<div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
				<LoadingSkeleton />
			</div>
		);
	}

	const { pullRequests, site } = state.toolResult ?? {
		pullRequests: [],
		site: "",
	};

	return (
		<div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
			<PullRequestsView initialPullRequests={pullRequests} site={site} />
		</div>
	);
}
