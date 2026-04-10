import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	ExternalLink,
	GitCommit,
	Rocket,
	RotateCcw,
	Search,
	User,
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	ListReleasesInput,
	ListReleasesOutput,
	ReleaseCommit,
} from "../../../api/tools/releases.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp * 1000;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString();
}

// ─── PromoteDialog ────────────────────────────────────────────────────────────

type ActionState = "idle" | "loading" | "done" | "error";

function PromoteDialog({
	commit,
	site,
	onClose,
}: {
	commit: ReleaseCommit | null;
	site: string;
	onClose: () => void;
}) {
	const app = useMcpApp();
	const [state, setState] = useState<ActionState>("idle");
	const [error, setError] = useState<string>();

	if (!commit) return null;

	const short = commit.oid.slice(0, 7);
	const title = commit.commit.message.split("\n")[0];

	const handlePromote = async () => {
		setState("loading");
		setError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "promote_to_production",
				arguments: { commitSha: commit.oid },
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Promotion failed");
			}
			setState("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Promotion failed");
			setState("error");
		}
	};

	const handleClose = () => {
		setState("idle");
		setError(undefined);
		onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Rocket className="w-4 h-4 text-primary" />
						Promote to Production
					</DialogTitle>
					<DialogDescription>
						This will immediately deploy commit{" "}
						<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
							{short}
						</code>{" "}
						to production on <strong>{site}</strong>.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
					<p className="font-medium truncate">{title}</p>
					<p className="text-xs text-muted-foreground mt-1">
						by {commit.commit.author.name} ·{" "}
						{formatDate(commit.commit.author.timestamp)}
					</p>
				</div>

				{state === "done" && (
					<p className="text-sm text-green-600 font-medium">
						✓ Promoted to production successfully.
					</p>
				)}
				{state === "error" && (
					<p className="text-sm text-destructive">{error}</p>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={state === "loading"}
					>
						{state === "done" ? "Close" : "Cancel"}
					</Button>
					{state !== "done" && (
						<Button
							variant="default"
							onClick={handlePromote}
							disabled={state === "loading"}
							className="gap-2"
						>
							{state === "loading" ? (
								<>
									<span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
									Promoting…
								</>
							) : (
								<>Promote</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── RevertDialog ─────────────────────────────────────────────────────────────

function RevertDialog({
	commit,
	onClose,
}: {
	commit: ReleaseCommit | null;
	onClose: () => void;
}) {
	const app = useMcpApp();
	const [state, setState] = useState<ActionState>("idle");
	const [error, setError] = useState<string>();
	const [prUrl, setPrUrl] = useState<string>();
	const [prNumber, setPrNumber] = useState<number>();

	if (!commit) return null;

	const short = commit.oid.slice(0, 7);
	const title = commit.commit.message.split("\n")[0];

	const handleRevert = async () => {
		setState("loading");
		setError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "revert_commit",
				arguments: {
					commitSha: commit.oid,
					commitMessage: commit.commit.message,
				},
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Revert failed");
			}
			const content = result?.content?.find((c) => c.type === "text");
			if (content?.type === "text") {
				try {
					const parsed = JSON.parse(content.text);
					if (parsed?.pullRequestUrl) setPrUrl(parsed.pullRequestUrl);
					if (parsed?.pullRequestNumber) setPrNumber(parsed.pullRequestNumber);
				} catch {}
			}
			setState("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Revert failed");
			setState("error");
		}
	};

	const handleClose = () => {
		setState("idle");
		setError(undefined);
		setPrUrl(undefined);
		setPrNumber(undefined);
		onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<RotateCcw className="w-4 h-4" />
						Revert Commit
					</DialogTitle>
					<DialogDescription>
						Creates a revert PR for commit{" "}
						<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
							{short}
						</code>
						. Your team will review and approve the PR before it merges.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
					<p className="font-medium truncate">{title}</p>
					<p className="text-xs text-muted-foreground mt-1">
						by {commit.commit.author.name} ·{" "}
						{formatDate(commit.commit.author.timestamp)}
					</p>
				</div>

				{state === "loading" && (
					<p className="text-xs text-muted-foreground">
						Provisioning a temporary sandbox and creating the revert branch…
					</p>
				)}

				{state === "done" && (
					<div className="flex flex-col gap-2">
						<p className="text-sm text-green-600 font-medium">
							✓ Revert PR created successfully.
						</p>
						{prUrl && (
							<a
								href={prUrl}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
							>
								<ExternalLink className="w-3.5 h-3.5 shrink-0" />
								Open PR #{prNumber} on GitHub
							</a>
						)}
					</div>
				)}

				{state === "error" && (
					<p className="text-sm text-destructive">{error}</p>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={state === "loading"}
					>
						{state === "done" ? "Close" : "Cancel"}
					</Button>
					{state !== "done" && (
						<Button
							variant="outline"
							onClick={handleRevert}
							disabled={state === "loading"}
							className="gap-2"
						>
							{state === "loading" ? (
								<>
									<span className="w-3.5 h-3.5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
									Creating PR…
								</>
							) : (
								<>
									Create Revert PR
								</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── CommitRow ────────────────────────────────────────────────────────────────

function CommitRow({
	commit,
	isProduction,
	onPromote,
	onRevert,
}: {
	commit: ReleaseCommit;
	isProduction: boolean;
	onPromote: (commit: ReleaseCommit) => void;
	onRevert: (commit: ReleaseCommit) => void;
}) {
	const short = commit.oid.slice(0, 7);
	const title = commit.commit.message.split("\n")[0];

	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-lg border p-4 transition-colors",
				isProduction
					? "border-green-500/40 bg-green-500/5 hover:bg-green-500/10"
					: "border-border bg-card hover:bg-muted/20",
			)}
		>
			<GitCommit
				className={cn(
					"w-4 h-4 mt-0.5 shrink-0",
					isProduction ? "text-green-500" : "text-muted-foreground",
				)}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<p className="text-sm font-medium text-foreground leading-snug truncate">
						{title}
					</p>
					{isProduction && (
						<span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 shrink-0">
							<CheckCircle2 className="w-3 h-3" />
							Production
						</span>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
					<code className="font-mono">{short}</code>
					<span>·</span>
					<span className="flex items-center gap-1">
						<User className="w-3 h-3" />
						{commit.commit.author.name}
					</span>
					<span>·</span>
					<span
						className="flex items-center gap-1"
						title={formatDate(commit.commit.author.timestamp)}
					>
						<Clock className="w-3 h-3" />
						{timeAgo(commit.commit.author.timestamp)}
					</span>
				</div>
			</div>
			<div className="flex items-center gap-2 shrink-0 ml-2">
				<Button
					variant="outline"
					size="sm"
					className="h-7 text-xs gap-1.5"
					onClick={() => onRevert(commit)}
					disabled={isProduction}
					title={isProduction ? "Already in production" : undefined}
				>
					<RotateCcw className="w-3 h-3" />
					Revert
				</Button>
				<Button
					variant={isProduction ? "outline" : "default"}
					size="sm"
					className={cn(
						"h-7 text-xs gap-1.5",
						isProduction &&
							"border-green-500/40 text-green-600 dark:text-green-400 cursor-default",
					)}
					onClick={() => !isProduction && onPromote(commit)}
					disabled={isProduction}
					title={isProduction ? "Already in production" : undefined}
				>
					<Rocket className="w-3 h-3" />
					{isProduction ? "Live" : "Promote"}
				</Button>
			</div>
		</div>
	);
}

// ─── ReleasesList ─────────────────────────────────────────────────────────────

function ReleasesList({
	commits,
	site,
	productionSha,
}: {
	commits: ReleaseCommit[];
	site: string;
	productionSha?: string;
}) {
	const [search, setSearch] = useState("");
	const [promoteTarget, setPromoteTarget] = useState<ReleaseCommit | null>(
		null,
	);
	const [revertTarget, setRevertTarget] = useState<ReleaseCommit | null>(null);

	const filtered = search.trim()
		? commits.filter(
				(c) =>
					c.commit.message.toLowerCase().includes(search.toLowerCase()) ||
					c.oid.startsWith(search.toLowerCase()) ||
					c.commit.author.name.toLowerCase().includes(search.toLowerCase()),
			)
		: commits;

	return (
		<section className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="text-base font-semibold">Releases</h1>
					{site && (
						<p className="text-sm text-muted-foreground mt-0.5">{site}</p>
					)}
				</div>
				<Badge variant="secondary" className="text-xs shrink-0 mt-0.5">
					{commits.length} commits
				</Badge>
			</div>

			{/* Search */}
			{commits.length > 5 && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Filter by message, SHA, or author…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9 h-8 text-sm"
					/>
				</div>
			)}

			{/* List */}
			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
					<GitCommit className="w-8 h-8 opacity-30" />
					<p className="text-sm">
						{search ? `No commits matching "${search}"` : "No commits found"}
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{filtered.map((commit) => (
						<CommitRow
							key={commit.oid}
							commit={commit}
							isProduction={
								!!productionSha && commit.oid.startsWith(productionSha)
							}
							onPromote={setPromoteTarget}
							onRevert={setRevertTarget}
						/>
					))}
				</div>
			)}

			{/* Dialogs */}
			<PromoteDialog
				commit={promoteTarget}
				site={site}
				onClose={() => setPromoteTarget(null)}
			/>
			<RevertDialog
				commit={revertTarget}
				onClose={() => setRevertTarget(null)}
			/>
		</section>
	);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
				<span className="text-sm">Fetching releases…</span>
			</div>
			<div className="flex flex-col gap-2">
				{(["s1", "s2", "s3", "s4", "s5"] as const).map((key) => (
					<div
						key={key}
						className="rounded-lg border border-border p-4 flex items-start gap-3"
					>
						<div className="w-4 h-4 rounded bg-muted animate-pulse shrink-0 mt-0.5" />
						<div className="flex-1 flex flex-col gap-1.5">
							<div className="h-3.5 bg-muted animate-pulse rounded w-3/4" />
							<div className="h-3 bg-muted animate-pulse rounded w-1/3" />
						</div>
						<div className="flex gap-2 shrink-0">
							<div className="h-7 w-16 bg-muted animate-pulse rounded" />
							<div className="h-7 w-20 bg-muted animate-pulse rounded" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReleasesPage() {
	const state = useMcpState<ListReleasesInput, ListReleasesOutput>();

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
						<CardTitle className="text-base">Releases</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Call the{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								list_releases
							</Badge>{" "}
							tool to view the commit history.
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
	const { commits, site, productionSha } = state.toolResult ?? {
		commits: [],
		site: "",
	};

	return (
		<div className="p-5">
			<ReleasesList
				commits={commits}
				site={site}
				productionSha={productionSha}
			/>
		</div>
	);
}
