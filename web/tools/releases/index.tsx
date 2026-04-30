import {
	CheckCircle2,
	ExternalLink,
	GitCommit,
	Rocket,
	RotateCcw,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
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

function splitCommitMessage(message: string): { title: string; body: string } {
	const idx = message.indexOf("\n");
	if (idx === -1) return { title: message.trim(), body: "" };
	return {
		title: message.slice(0, idx).trim(),
		body: message
			.slice(idx + 1)
			.replace(/\s+/g, " ")
			.trim(),
	};
}

// ─── AuthorAvatar ─────────────────────────────────────────────────────────────

function AuthorAvatar({
	name,
	avatarUrl,
	login,
	size = 24,
}: {
	name: string;
	avatarUrl?: string | null;
	login?: string | null;
	size?: number;
}) {
	const initials = name
		.split(" ")
		.map((p) => p[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	const src =
		avatarUrl ?? (login ? `https://github.com/${login}.png?size=48` : null);

	if (src) {
		return (
			<img
				src={src}
				alt={name}
				className="rounded-full shrink-0 bg-muted"
				style={{ width: size, height: size }}
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).style.display = "none";
				}}
			/>
		);
	}

	return (
		<span
			className="inline-flex rounded-full bg-muted items-center justify-center font-medium text-muted-foreground shrink-0"
			style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
		>
			{initials}
		</span>
	);
}

// ─── PromoteDialog ────────────────────────────────────────────────────────────

type ActionState = "idle" | "loading" | "deploying" | "done" | "error";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function PromoteDialog({
	commit,
	site,
	onClose,
	onPromoted,
}: {
	commit: ReleaseCommit | null;
	site: string;
	onClose: () => void;
	onPromoted?: (sha: string) => void;
}) {
	const app = useMcpApp();
	const [state, setState] = useState<ActionState>("idle");
	const [error, setError] = useState<string>();
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, []);

	if (!commit) return null;

	const short = commit.oid.slice(0, 7);
	const { title } = splitCommitMessage(commit.commit.message);

	const startPolling = (targetSha: string) => {
		setState("deploying");
		const deadline = Date.now() + POLL_TIMEOUT_MS;

		pollRef.current = setInterval(async () => {
			if (Date.now() > deadline) {
				const id = pollRef.current;
				if (id !== null) clearInterval(id);
				pollRef.current = null;
				setState("done");
				onPromoted?.(targetSha);
				return;
			}
			const result = await app?.callServerTool({
				name: "get_production_sha",
				arguments: {},
			});
			const text = result?.content?.find((c) => c.type === "text");
			if (text?.type !== "text") return;
			try {
				const data = JSON.parse(text.text) as { sha?: string };
				if (data.sha === targetSha) {
					const id = pollRef.current;
					if (id !== null) clearInterval(id);
					pollRef.current = null;
					setState("done");
					onPromoted?.(targetSha);
				}
			} catch {
				// parse error, keep polling
			}
		}, POLL_INTERVAL_MS);
	};

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
			startPolling(commit.oid);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Promotion failed");
			setState("error");
		}
	};

	const handleClose = () => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
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

				{state === "deploying" && (
					<p className="text-sm text-muted-foreground flex items-center gap-2">
						<span className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin shrink-0" />
						Deploying… checking every 5s until live.
					</p>
				)}
				{state === "done" && (
					<p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
						<CheckCircle2 className="w-4 h-4" />
						Live in production.
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
					{state !== "done" && state !== "deploying" && (
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
	const { title } = splitCommitMessage(commit.commit.message);

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
						<p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
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
								<>Create Revert PR</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── CommitCard ───────────────────────────────────────────────────────────────

function CommitCard({
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
	const { title, body } = splitCommitMessage(commit.commit.message);

	return (
		<div
			className={cn(
				"group flex flex-col gap-2.5 rounded-lg border bg-card p-4 transition-colors",
				isProduction
					? "border-emerald-500/40 bg-emerald-500/[0.04] hover:border-emerald-500/60"
					: "border-border hover:border-foreground/20",
			)}
		>
			{/* Top: SHA + status icon */}
			<div className="flex items-start justify-between gap-2">
				<code
					className="text-xs font-mono text-muted-foreground truncate"
					title={commit.oid}
				>
					{short}
				</code>
				{isProduction ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span
								role="img"
								aria-label="Live in production"
								className="inline-flex shrink-0 cursor-default"
							>
								<CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="left" className="max-w-[240px] text-sm">
							<span className="font-medium">Live</span>
							<span className="block text-background/75 mt-0.5">
								Currently deployed to production
							</span>
						</TooltipContent>
					</Tooltip>
				) : (
					<Tooltip>
						<TooltipTrigger asChild>
							<span
								role="img"
								aria-label="Available commit"
								className="inline-flex shrink-0 cursor-default"
							>
								<GitCommit className="h-[18px] w-[18px] text-muted-foreground" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="left" className="max-w-[240px] text-sm">
							<span className="font-medium">Available</span>
							<span className="block text-background/75 mt-0.5">
								Not currently in production — promote to deploy
							</span>
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Title */}
			<h3 className="text-[15px] font-medium text-foreground leading-snug line-clamp-2">
				{title}
			</h3>

			{/* Body (multi-line commit message after the title) */}
			{body && (
				<p className="text-sm text-muted-foreground leading-snug line-clamp-2">
					{body}
				</p>
			)}

			{/* Footer: actions  —  avatar · time */}
			<div className="mt-1 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<Button
						variant="outline"
						size="sm"
						className="h-8 text-sm gap-1.5"
						onClick={() => onRevert(commit)}
						disabled={isProduction}
						title={isProduction ? "Already in production" : undefined}
					>
						<RotateCcw className="w-3.5 h-3.5" />
						Revert
					</Button>
					{isProduction ? (
						<span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 className="w-3.5 h-3.5" />
							Live
						</span>
					) : (
						<Button
							variant="default"
							size="sm"
							className="h-8 text-sm gap-1.5"
							onClick={() => onPromote(commit)}
						>
							<Rocket className="w-3.5 h-3.5" />
							Promote
						</Button>
					)}
				</div>

				{/* Right: avatar · time */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex shrink-0 cursor-default">
								<AuthorAvatar
									name={commit.commit.author.name}
									avatarUrl={commit.avatarUrl}
									login={commit.login}
									size={24}
								/>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">
							{commit.commit.author.name}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="shrink-0 cursor-default">
								{timeAgo(commit.commit.author.timestamp)}
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-sm">
							{formatDate(commit.commit.author.timestamp)}
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	);
}

// ─── ReleasesView ─────────────────────────────────────────────────────────────

function ReleasesView({
	commits,
	site,
	productionSha: initialProductionSha,
}: {
	commits: ReleaseCommit[];
	site: string;
	productionSha?: string;
}) {
	const [search, setSearch] = useState("");
	const [productionSha, setProductionSha] = useState(initialProductionSha);
	const [promoteTarget, setPromoteTarget] = useState<ReleaseCommit | null>(
		null,
	);
	const [revertTarget, setRevertTarget] = useState<ReleaseCommit | null>(null);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return commits;
		return commits.filter(
			(c) =>
				c.commit.message.toLowerCase().includes(q) ||
				c.oid.toLowerCase().startsWith(q) ||
				c.commit.author.name.toLowerCase().includes(q) ||
				(c.login ?? "").toLowerCase().includes(q),
		);
	}, [commits, search]);

	return (
		<section className="flex flex-col gap-6">
			{/* Title */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h1 className="text-xl font-medium leading-tight">Releases</h1>
					{site && (
						<p className="text-sm text-muted-foreground mt-1 truncate">
							{site}
						</p>
					)}
				</div>
				<Badge variant="secondary" className="text-xs shrink-0">
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
						className="pl-9 h-9 text-sm"
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
						<CommitCard
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
				onPromoted={(sha) => {
					setProductionSha(sha);
					setPromoteTarget(null);
				}}
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
						className="rounded-lg border border-border p-4 flex flex-col gap-2.5"
					>
						<div className="flex items-center justify-between gap-2">
							<div className="h-3.5 bg-muted animate-pulse rounded w-20" />
							<div className="w-[18px] h-[18px] rounded bg-muted animate-pulse" />
						</div>
						<div className="h-4 bg-muted animate-pulse rounded w-3/4" />
						<div className="h-3.5 bg-muted animate-pulse rounded w-full" />
						<div className="flex items-center justify-between gap-2 mt-1">
							<div className="flex gap-2">
								<div className="h-8 w-20 bg-muted animate-pulse rounded" />
								<div className="h-8 w-24 bg-muted animate-pulse rounded" />
							</div>
							<div className="flex items-center gap-2">
								<div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
								<div className="h-3.5 w-16 bg-muted animate-pulse rounded" />
							</div>
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
			<div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
				<LoadingSkeleton />
			</div>
		);
	}

	const { commits, site, productionSha } = state.toolResult ?? {
		commits: [],
		site: "",
	};

	return (
		<div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
			<ReleasesView
				commits={commits}
				site={site}
				productionSha={productionSha}
			/>
		</div>
	);
}
