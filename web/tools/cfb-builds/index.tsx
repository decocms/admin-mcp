import {
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleDashed,
	Clock,
	GitBranch,
	GitCommit,
	Loader2,
	XCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	CfBuild,
	CfBuildLogChunk,
	CfBuildStatus,
	CfbGetBuildLogsOutput,
	CfbGetBuildOutput,
	CfbListBuildsOutput,
	CfbTriggerBuildOutput,
} from "../../../api/tools/cfb-builds.ts";

type AnyOutput =
	| CfbListBuildsOutput
	| CfbGetBuildOutput
	| CfbGetBuildLogsOutput
	| CfbTriggerBuildOutput;

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: CfBuildStatus) {
	const map: Record<
		CfBuildStatus,
		{ label: string; className: string; Icon: typeof Loader2 }
	> = {
		queued: {
			label: "Queued",
			className: "bg-muted text-muted-foreground",
			Icon: CircleDashed,
		},
		initializing: {
			label: "Initializing",
			className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
			Icon: Loader2,
		},
		running: {
			label: "Running",
			className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
			Icon: Loader2,
		},
		success: {
			label: "Success",
			className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
			Icon: CheckCircle2,
		},
		failure: {
			label: "Failure",
			className: "bg-destructive/10 text-destructive",
			Icon: XCircle,
		},
		cancelled: {
			label: "Cancelled",
			className: "bg-muted text-muted-foreground",
			Icon: XCircle,
		},
	};
	const m = map[status];
	const spin = status === "running" || status === "initializing";
	return (
		<Badge
			variant="secondary"
			className={cn("gap-1 font-mono text-xs", m.className)}
		>
			<m.Icon className={cn("w-3 h-3", spin && "animate-spin")} />
			{m.label}
		</Badge>
	);
}

function formatDuration(ms?: number) {
	if (ms === undefined) return "—";
	if (ms < 1000) return `${ms}ms`;
	const s = Math.round(ms / 100) / 10;
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rem = Math.round(s - m * 60);
	return `${m}m ${rem}s`;
}

function timeAgo(iso: string) {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

// ─── BuildLogs ────────────────────────────────────────────────────────────────

function BuildLogs({
	buildId,
	status,
}: {
	buildId: string;
	status: CfBuildStatus;
}) {
	const app = useMcpApp();
	const [logs, setLogs] = useState<CfBuildLogChunk[] | null>(null);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const isRunning = status === "running" || status === "initializing";

	const fetchLogs = useCallback(async () => {
		if (!app) return;
		try {
			const res = await app.callServerTool({
				name: "cfb_get_build_logs",
				arguments: { buildId },
			});
			if (res?.isError) {
				const text = res.content?.find((c) => c.type === "text");
				setError(text?.type === "text" ? text.text : "Failed to fetch logs");
				return;
			}
			const text = res?.content?.find((c) => c.type === "text");
			if (text?.type === "text") {
				try {
					const parsed = JSON.parse(text.text) as CfbGetBuildLogsOutput;
					setLogs(parsed.lines);
				} catch {
					setError("Could not parse logs response");
				}
			}
		} finally {
			setLoading(false);
		}
	}, [app, buildId]);

	useEffect(() => {
		fetchLogs();
		if (!isRunning) return;
		const id = setInterval(fetchLogs, 2_000);
		return () => clearInterval(id);
	}, [fetchLogs, isRunning]);

	if (loading) {
		return (
			<div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
				<Loader2 className="w-3.5 h-3.5 animate-spin" />
				Fetching logs…
			</div>
		);
	}
	if (error) {
		return <div className="text-xs text-destructive p-3">{error}</div>;
	}
	if (!logs || logs.length === 0) {
		return (
			<div className="text-xs text-muted-foreground p-3">No log lines yet.</div>
		);
	}
	return (
		<pre className="text-xs font-mono bg-muted/50 rounded-md p-3 max-h-[400px] overflow-auto whitespace-pre-wrap break-all">
			{logs.map((l) => (
				<div
					key={l.line}
					className={cn(l.stream === "stderr" && "text-destructive")}
				>
					<span className="text-muted-foreground mr-2">{l.line}</span>
					{l.message}
				</div>
			))}
		</pre>
	);
}

// ─── BuildRow ─────────────────────────────────────────────────────────────────

function BuildRow({ build }: { build: CfBuild }) {
	const [expanded, setExpanded] = useState(false);
	const shortSha = build.commit_hash?.slice(0, 7);
	const buildId = build.build_uuid;

	return (
		<div className="border-b border-border last:border-0">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
			>
				{expanded ? (
					<ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
				) : (
					<ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
				)}
				{statusBadge(build.status)}
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
					{build.branch && (
						<span className="inline-flex items-center gap-1 truncate">
							<GitBranch className="w-3 h-3 shrink-0" />
							<span className="truncate">{build.branch}</span>
						</span>
					)}
					{shortSha && (
						<span className="inline-flex items-center gap-1">
							<GitCommit className="w-3 h-3 shrink-0" />
							<code className="font-mono">{shortSha}</code>
						</span>
					)}
					{build.commit_message && (
						<span className="truncate ml-1">
							{build.commit_message.split("\n")[0]}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
					<Clock className="w-3 h-3" />
					{formatDuration(build.build_duration_ms)}
					<span>·</span>
					<span>{timeAgo(build.created_on)}</span>
				</div>
			</button>
			{expanded && (
				<div className="px-3 pb-3 pt-1">
					<BuildLogs buildId={buildId} status={build.status} />
				</div>
			)}
		</div>
	);
}

// ─── views ────────────────────────────────────────────────────────────────────

function BuildsList({ builds }: { builds: CfBuild[] }) {
	const app = useMcpApp();
	const [triggering, setTriggering] = useState(false);

	const handleTrigger = async () => {
		if (!app) return;
		setTriggering(true);
		try {
			await app.callServerTool({
				name: "cfb_trigger_build",
				arguments: {},
			});
		} finally {
			setTriggering(false);
		}
	};

	return (
		<section className="flex flex-col gap-4">
			<header className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-xl font-medium">Builds</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						{builds.length} recent build{builds.length === 1 ? "" : "s"}
					</p>
				</div>
				<Button
					onClick={handleTrigger}
					disabled={triggering}
					className="gap-2"
					size="sm"
				>
					{triggering ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<Zap className="w-3.5 h-3.5" />
					)}
					Trigger build
				</Button>
			</header>
			{builds.length === 0 ? (
				<Card>
					<CardContent className="py-10 text-center text-sm text-muted-foreground">
						No builds yet.
					</CardContent>
				</Card>
			) : (
				<Card className="overflow-hidden p-0">
					{builds.map((b) => (
						<BuildRow key={b.build_uuid} build={b} />
					))}
				</Card>
			)}
		</section>
	);
}

function SingleBuild({ build }: { build: CfBuild }) {
	return (
		<section className="flex flex-col gap-4">
			<header className="flex items-center justify-between gap-3">
				<h1 className="text-xl font-medium">Build details</h1>
				{statusBadge(build.status)}
			</header>
			<Card className="overflow-hidden p-0">
				<BuildRow build={build} />
			</Card>
		</section>
	);
}

function StandaloneLogs({ logs }: { logs: CfBuildLogChunk[] }) {
	return (
		<section className="flex flex-col gap-4">
			<h1 className="text-xl font-medium">Build logs</h1>
			<Card>
				<CardContent className="pt-4">
					{logs.length === 0 ? (
						<p className="text-sm text-muted-foreground">No log lines.</p>
					) : (
						<pre className="text-xs font-mono bg-muted/50 rounded-md p-3 max-h-[600px] overflow-auto whitespace-pre-wrap break-all">
							{logs.map((l) => (
								<div
									key={l.line}
									className={cn(l.stream === "stderr" && "text-destructive")}
								>
									<span className="text-muted-foreground mr-2">{l.line}</span>
									{l.message}
								</div>
							))}
						</pre>
					)}
				</CardContent>
			</Card>
		</section>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CfbBuildsPage() {
	const state = useMcpState<unknown, AnyOutput>();

	if (state.status === "initializing" || state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<Loader2 className="w-4 h-4 animate-spin" />
					<span className="text-sm">
						{state.status === "tool-input" ? "Working…" : "Connecting…"}
					</span>
				</div>
			</div>
		);
	}

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">Builds</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								cfb_list_builds
							</Badge>{" "}
							to view recent Cloudflare builds.
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
				<p className="text-sm text-muted-foreground">
					Tool call was cancelled.
				</p>
			</div>
		);
	}

	const result = state.toolResult;
	if (!result) return null;

	return (
		<div className="mx-auto w-full max-w-[1000px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
			{state.toolName === "cfb_list_builds" && "builds" in result ? (
				<BuildsList builds={(result as CfbListBuildsOutput).builds} />
			) : state.toolName === "cfb_get_build_logs" && "lines" in result ? (
				<StandaloneLogs logs={(result as CfbGetBuildLogsOutput).lines} />
			) : (
				<SingleBuild build={result as CfBuild} />
			)}
		</div>
	);
}
