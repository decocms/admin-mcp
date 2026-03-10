import { diffLines } from "diff";
import {
	AlertTriangle,
	ArrowLeft,
	Check,
	CheckCircle2,
	Clock,
	Copy,
	ExternalLink,
	FileDiff,
	FileText,
	GitBranch,
	Globe,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Server,
	Trash2,
	Undo2,
	Upload,
	Wifi,
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
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	AdminEnvironment,
	CreateEnvironmentOutput,
	DeleteEnvironmentInput,
	DeleteEnvironmentOutput,
	ListEnvironmentsInput,
	ListEnvironmentsOutput,
} from "../../../api/tools/environments.ts";
import type {
	GitDiffResult,
	GitStatus,
	GitStatusFile,
} from "../../../api/tools/git.ts";

// ─── shared components ────────────────────────────────────────────────────────

const PLATFORM_STYLES: Record<
	string,
	{ dot: string; label: string; bg: string }
> = {
	sandbox: {
		dot: "bg-chart-1",
		label: "text-chart-1",
		bg: "bg-chart-1/8",
	},
	content: {
		dot: "bg-chart-2",
		label: "text-chart-2",
		bg: "bg-chart-2/8",
	},
	tunnel: {
		dot: "bg-warning",
		label: "text-warning-foreground",
		bg: "bg-warning/10",
	},
	deco: {
		dot: "bg-success",
		label: "text-success-foreground",
		bg: "bg-success/10",
	},
};

function StatusBadge({ platform }: { platform?: string }) {
	const key = platform ?? "deco";
	const style = PLATFORM_STYLES[key] ?? PLATFORM_STYLES.deco;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
				style.bg,
				style.label,
			)}
		>
			<span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />
			{key}
		</span>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
			className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
			title="Copy"
		>
			{copied ? (
				<Check className="w-3.5 h-3.5 text-success" />
			) : (
				<Copy className="w-3.5 h-3.5" />
			)}
		</button>
	);
}

function EnvironmentCard({
	env,
	onClick,
	onDelete,
	onDeleted,
}: {
	env: AdminEnvironment;
	onClick: () => void;
	onDelete: (name: string) => Promise<void>;
	onDeleted: (name: string) => void;
}) {
	const [deleteState, setDeleteState] = useState<
		"idle" | "confirm" | "deleting" | "error"
	>("idle");
	const [deleteError, setDeleteError] = useState<string>();

	const handleDeleteClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteState("confirm");
	};

	const handleDeleteCancel = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteState("idle");
		setDeleteError(undefined);
	};

	const handleDeleteConfirm = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteState("deleting");
		setDeleteError(undefined);
		try {
			await onDelete(env.name);
			onDeleted(env.name);
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : "Delete failed");
			setDeleteState("error");
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: contains nested <button> elements — cannot use <button> as outer wrapper
		<div
			className={cn(
				"relative group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-all cursor-pointer",
				deleteState === "idle" && "hover:border-primary/30 hover:shadow-sm",
			)}
			onClick={deleteState === "idle" ? onClick : undefined}
			onKeyDown={(e) =>
				e.key === "Enter" && deleteState === "idle" && onClick()
			}
			role="button"
			tabIndex={0}
		>
			{/* Title row */}
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
						<Server className="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<span className="font-medium text-sm truncate leading-tight">
						{env.name}
					</span>
				</div>
				<div className="flex items-center gap-0.5 shrink-0">
					{/* Badge — hidden on hover; actions — visible on hover */}
					<span className="group-hover:hidden">
						<StatusBadge platform={env.platform} />
					</span>
					{deleteState === "idle" && (
						<div className="hidden group-hover:flex items-center gap-0.5">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onClick();
								}}
								className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
								title="Preview"
							>
								<Pencil className="w-3.5 h-3.5" />
							</button>
							{env.url && (
								<a
									href={`${env.url}?__cb=${crypto.randomUUID()}`}
									target="_blank"
									rel="noreferrer"
									onClick={(e) => e.stopPropagation()}
									className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
									title="Open in new tab"
								>
									<ExternalLink className="w-3.5 h-3.5" />
								</a>
							)}
							<button
								type="button"
								onClick={handleDeleteClick}
								className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
								title="Delete environment"
							>
								<Trash2 className="w-3.5 h-3.5" />
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Branch / commit */}
			{(env.upstream ?? env.head) && (
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<GitBranch className="w-3 h-3 shrink-0" />
					<span className="truncate font-mono">
						{env.upstream ?? env.head?.slice(0, 8)}
					</span>
				</div>
			)}

			{/* URL pill */}
			{env.url && (
				<div className="flex items-center gap-1 bg-muted/60 border border-border/50 rounded-md pl-2 pr-1 py-0.5">
					<code className="flex-1 text-xs truncate text-muted-foreground font-mono py-0.5">
						{env.url}
					</code>
					<CopyButton text={env.url} />
				</div>
			)}

			{/* Flags */}
			{(env.public || env.readonly || env.transient) && (
				<div className="flex gap-1.5 flex-wrap">
					{env.public && (
						<Badge variant="outline" className="text-xs">
							public
						</Badge>
					)}
					{env.readonly && (
						<Badge variant="outline" className="text-xs">
							read-only
						</Badge>
					)}
					{env.transient && (
						<Badge variant="outline" className="text-xs">
							transient
						</Badge>
					)}
				</div>
			)}

			{/* Confirm / deleting / error overlay */}
			{deleteState !== "idle" && (
				<div
					className="absolute inset-0 rounded-lg bg-background/90 border border-destructive/30 flex flex-col items-center justify-center gap-2.5 p-3 z-10"
					role="alertdialog"
					aria-label="Confirm delete"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					{deleteState === "error" ? (
						<>
							<AlertTriangle className="w-4 h-4 text-destructive/70 shrink-0" />
							<p className="text-xs text-destructive text-center line-clamp-2">
								{deleteError}
							</p>
							<Button
								size="sm"
								variant="ghost"
								className="h-6 text-xs px-2"
								onClick={handleDeleteCancel}
							>
								Close
							</Button>
						</>
					) : deleteState === "deleting" ? (
						<>
							<span className="w-4 h-4 border-2 border-muted border-t-destructive/50 rounded-full animate-spin" />
							<p className="text-xs text-muted-foreground">Deleting…</p>
						</>
					) : (
						<>
							<p className="text-xs font-medium">Delete this environment?</p>
							<p className="text-xs text-muted-foreground text-center">
								This is irreversible.
							</p>
							<div className="flex gap-1.5">
								<Button
									size="sm"
									variant="destructive"
									className="h-6 text-xs px-2.5"
									onClick={handleDeleteConfirm}
								>
									Delete
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-6 text-xs px-2.5"
									onClick={handleDeleteCancel}
								>
									Cancel
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

// ─── EnvironmentPreview ───────────────────────────────────────────────────────

type PreviewStatus = "loading" | "ready" | "timeout";

const RETRY_DELAY_MS = 3000;
const MAX_ELAPSED_SEC = 120; // 2 minutes

function PreviewLoadingState({
	elapsedSec,
	envName,
	timedOut,
}: {
	elapsedSec: number;
	envName: string;
	timedOut: boolean;
}) {
	const mins = Math.floor(elapsedSec / 60);
	const secs = elapsedSec % 60;
	const elapsedLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
	const progress = Math.min((elapsedSec / MAX_ELAPSED_SEC) * 100, 100);

	if (timedOut) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
				<div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
					<Clock className="w-6 h-6 text-destructive/70" />
				</div>
				<div className="space-y-1.5 max-w-xs">
					<p className="text-sm font-medium">Preview timed out</p>
					<p className="text-xs text-muted-foreground">
						<span className="font-mono">{envName}</span> didn't respond after{" "}
						{Math.round(MAX_ELAPSED_SEC / 60)} minutes.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
			{/* Animated icon */}
			<div className="relative">
				<div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center">
					<Wifi className="w-6 h-6 text-muted-foreground" />
				</div>
				<span className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-background bg-chart-1 animate-pulse" />
			</div>

			{/* Message */}
			<div className="text-center space-y-1.5 max-w-xs">
				<p className="text-sm font-medium">Warming up environment</p>
				<p className="text-xs text-muted-foreground">
					Waiting for{" "}
					<span className="font-mono text-foreground/70">{envName}</span> to
					come online…
				</p>
			</div>

			{/* Progress bar */}
			<div className="w-full max-w-[220px] space-y-2">
				<div className="h-1 w-full rounded-full bg-muted overflow-hidden">
					<div
						className="h-full rounded-full bg-primary/60 transition-all duration-1000"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
						Retrying…
					</span>
					<span>{elapsedLabel}</span>
				</div>
			</div>

			{/* Skeleton UI preview hint */}
			<div className="w-full max-w-[280px] space-y-2 opacity-30 pointer-events-none select-none">
				<div className="h-7 rounded-md bg-muted animate-pulse" />
				<div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
				<div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
				<div className="mt-3 grid grid-cols-2 gap-2">
					<div className="h-16 rounded-lg bg-muted animate-pulse" />
					<div className="h-16 rounded-lg bg-muted animate-pulse" />
				</div>
				<div className="h-24 rounded-lg bg-muted animate-pulse" />
			</div>
		</div>
	);
}

function EnvironmentPreview({
	env,
	onBack,
}: {
	env: AdminEnvironment;
	onBack: () => void;
}) {
	const app = useMcpApp();
	const [previewUrl, setPreviewUrl] = useState(
		() => `${env.url}?__cb=${crypto.randomUUID()}`,
	);
	const [status, setStatus] = useState<PreviewStatus>("loading");
	const [elapsedSec, setElapsedSec] = useState(0);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [changeCount, setChangeCount] = useState<number | null>(null);
	const [showChanges, setShowChanges] = useState(false);

	// Wall-clock elapsed counter — ticks every second while loading
	useEffect(() => {
		if (status !== "loading") return;
		const interval = setInterval(() => {
			setElapsedSec((prev) => {
				const next = prev + 1;
				if (next >= MAX_ELAPSED_SEC) setStatus("timeout");
				return next;
			});
		}, 1000);
		return () => clearInterval(interval);
	}, [status]);

	// Cleanup pending retry on unmount
	useEffect(() => {
		return () => clearTimeout(retryTimerRef.current);
	}, []);

	// Fetch git status to show change count badge
	useEffect(() => {
		if (!app) return;
		(async () => {
			const result = await app.callServerTool({
				name: "git_status",
				arguments: { env: env.name },
			});
			if (!result?.isError && result?.structuredContent) {
				const s = result.structuredContent as { files?: unknown[] };
				setChangeCount(s.files?.length ?? 0);
			}
		})();
	}, [env.name, app]);

	// iframe fired onLoad → environment responded, show it
	const handleLoad = useCallback(() => {
		setStatus("ready");
	}, []);

	// iframe fired onError → server not up yet, retry after delay
	const handleError = useCallback(() => {
		if (status !== "loading") return;
		retryTimerRef.current = setTimeout(() => {
			// Change URL to remount the iframe with a fresh request
			setPreviewUrl(`${env.url}?__cb=${crypto.randomUUID()}`);
		}, RETRY_DELAY_MS);
	}, [status, env.url]);

	const refresh = () => {
		clearTimeout(retryTimerRef.current);
		setPreviewUrl(`${env.url}?__cb=${crypto.randomUUID()}`);
		setStatus("loading");
		setElapsedSec(0);
	};

	if (showChanges) {
		return <ChangesView env={env} onBack={() => setShowChanges(false)} />;
	}

	return (
		<div className="flex flex-col h-dvh">
			{/* Toolbar */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
				<button
					type="button"
					onClick={onBack}
					className="cursor-pointer p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
					title="Back to list"
				>
					<ArrowLeft className="w-4 h-4" />
				</button>

				<div className="h-4 w-px bg-border mx-0.5" />

				<div className="flex items-center gap-2 min-w-0 flex-1">
					<span className="text-sm font-medium truncate">{env.name}</span>
					<StatusBadge platform={env.platform} />
					{status === "loading" && (
						<span className="text-xs text-muted-foreground italic shrink-0">
							starting…
						</span>
					)}
				</div>

				<div className="flex items-center gap-0.5 shrink-0">
					<button
						type="button"
						onClick={refresh}
						className="cursor-pointer p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
						title="Refresh preview"
					>
						<RefreshCw
							className={cn(
								"w-3.5 h-3.5",
								status === "loading" && "animate-spin",
							)}
						/>
					</button>

					{/* Changes count button */}
					<button
						type="button"
						onClick={() => setShowChanges(true)}
						className={cn(
							"cursor-pointer relative p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground",
							changeCount !== null &&
								changeCount > 0 &&
								"text-warning hover:text-warning",
						)}
						title={
							changeCount === null
								? "Loading changes…"
								: changeCount === 0
									? "No changes"
									: `${changeCount} change${changeCount !== 1 ? "s" : ""}`
						}
					>
						<FileDiff className="w-3.5 h-3.5" />
						{changeCount !== null && changeCount > 0 && (
							<span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-warning text-black text-[9px] font-bold leading-none px-0.5">
								{changeCount > 99 ? "99+" : changeCount}
							</span>
						)}
					</button>

					<CopyButton text={env.url ?? ""} />
					<a
						href={previewUrl}
						target="_blank"
						rel="noreferrer"
						className="cursor-pointer p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
						title="Open in browser"
					>
						<ExternalLink className="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			{/* Loading overlay + iframe rendered together so onLoad/onError fire */}
			<div className="flex-1 relative overflow-hidden">
				{status !== "ready" && (
					<div className="absolute inset-0 z-10 flex flex-col bg-background">
						<PreviewLoadingState
							elapsedSec={elapsedSec}
							envName={env.name}
							timedOut={status === "timeout"}
						/>
					</div>
				)}
				<iframe
					key={previewUrl}
					src={previewUrl}
					title={`Preview of ${env.name}`}
					onLoad={handleLoad}
					onError={handleError}
					className="absolute inset-0 w-full h-full border-0"
				/>
			</div>
		</div>
	);
}

// ─── DiffViewer ───────────────────────────────────────────────────────────────

function DiffViewer({
	diff,
}: {
	diff: { from: string | null; to: string | null };
}) {
	const chunks = diffLines(diff.from ?? "", diff.to ?? "");

	let addedCount = 0;
	let removedCount = 0;
	for (const c of chunks) {
		if (c.added) addedCount += c.count ?? 0;
		if (c.removed) removedCount += c.count ?? 0;
	}

	const rows: {
		lineNoA: number | null;
		lineNoB: number | null;
		sign: "+" | "-" | " ";
		content: string;
	}[] = [];
	let lineA = 1;
	let lineB = 1;
	for (const chunk of chunks) {
		const lines = chunk.value.replace(/\n$/, "").split("\n");
		for (const content of lines) {
			if (chunk.added) {
				rows.push({ lineNoA: null, lineNoB: lineB++, sign: "+", content });
			} else if (chunk.removed) {
				rows.push({ lineNoA: lineA++, lineNoB: null, sign: "-", content });
			} else {
				rows.push({ lineNoA: lineA++, lineNoB: lineB++, sign: " ", content });
			}
		}
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
				<span className="text-xs font-medium text-muted-foreground">
					Changes
				</span>
				<span className="text-xs font-medium text-success">+{addedCount}</span>
				<span className="text-xs font-medium text-destructive">
					-{removedCount}
				</span>
			</div>
			<div className="flex-1 overflow-auto">
				<table className="w-full border-collapse font-mono text-xs">
					<tbody>
						{rows.map((row) => (
							<tr
								key={`${row.lineNoA ?? ""}-${row.lineNoB ?? ""}-${row.sign}-${String(row.content).slice(0, 80)}`}
								className={cn(
									"leading-5",
									row.sign === "+" && "bg-success/10",
									row.sign === "-" && "bg-destructive/10",
								)}
							>
								<td className="select-none w-10 text-right pr-2 text-muted-foreground/50 border-r border-border/40 py-px pl-2">
									{row.lineNoA ?? ""}
								</td>
								<td className="select-none w-10 text-right pr-2 text-muted-foreground/50 border-r border-border/40 py-px pl-1">
									{row.lineNoB ?? ""}
								</td>
								<td
									className={cn(
										"select-none w-4 text-center py-px",
										row.sign === "+" && "text-success font-bold",
										row.sign === "-" && "text-destructive font-bold",
									)}
								>
									{row.sign}
								</td>
								<td className="py-px pl-1 pr-4 whitespace-pre-wrap break-all">
									{row.content}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// ─── file status helpers ──────────────────────────────────────────────────────

function fileStatusLabel(file: GitStatusFile): {
	label: string;
	color: string;
} {
	const wd = file.working_dir.trim();
	const idx = file.index.trim();
	if (wd === "D" || idx === "D")
		return { label: "D", color: "text-destructive" };
	if (wd === "A" || idx === "A" || file.path === "?" || wd === "?")
		return { label: "A", color: "text-success" };
	return { label: "M", color: "text-warning-foreground" };
}

// ─── ChangesView ──────────────────────────────────────────────────────────────

function ChangesView({
	env,
	onBack,
}: {
	env: AdminEnvironment;
	onBack: () => void;
}) {
	const app = useMcpApp();
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [statusLoading, setStatusLoading] = useState(true);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [diffs, setDiffs] = useState<GitDiffResult["diffs"] | null>(null);
	const [publishState, setPublishState] = useState<
		"idle" | "publishing" | "success" | "error"
	>("idle");
	const [publishCommit, setPublishCommit] = useState<string>();
	const [publishError, setPublishError] = useState<string>();

	useEffect(() => {
		(async () => {
			setStatusLoading(true);
			const [statusResult, diffsResult] = await Promise.all([
				app?.callServerTool({
					name: "git_status",
					arguments: { env: env.name },
				}),
				app?.callServerTool({
					name: "git_diff",
					arguments: { env: env.name },
				}),
			]);
			if (!statusResult?.isError && statusResult?.structuredContent) {
				setStatus(statusResult.structuredContent as GitStatus);
			}
			if (!diffsResult?.isError && diffsResult?.structuredContent) {
				const result = diffsResult.structuredContent as GitDiffResult;
				setDiffs(result.diffs);
			}
			setStatusLoading(false);
		})();
	}, [env.name, app]);

	const selectFile = (path: string) => {
		setSelectedFile((prev) => (prev === path ? null : path));
	};

	// Paths in releases/git/diff.ts have a leading "/" but status paths don't
	const getDiffForFile = (
		path: string,
	): { from: string | null; to: string | null } | null => {
		if (!diffs) return null;
		return diffs[`/${path}`] ?? diffs[path] ?? null;
	};

	const handlePublish = async () => {
		setPublishState("publishing");
		setPublishError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "git_publish",
				arguments: { env: env.name },
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Publish failed");
			}
			const data = result?.structuredContent as { commit?: string } | undefined;
			setPublishCommit(data?.commit);
			setPublishState("success");
		} catch (err) {
			setPublishError(err instanceof Error ? err.message : "Publish failed");
			setPublishState("error");
		}
	};

	const [discarding, setDiscarding] = useState<Set<string>>(new Set());

	const handleDiscard = async (file: GitStatusFile) => {
		const isNew =
			file.index === "?" ||
			file.working_dir === "?" ||
			(status?.not_added ?? []).includes(file.path);

		setDiscarding((prev) => new Set(prev).add(file.path));
		try {
			if (isNew) {
				await app?.callServerTool({
					name: "fs_unlink",
					arguments: { env: env.name, filepath: file.path },
				});
			} else {
				await app?.callServerTool({
					name: "git_discard",
					arguments: { env: env.name, filepaths: [file.path] },
				});
			}
			setStatus((prev) =>
				prev
					? {
							...prev,
							files: prev.files.filter((f) => f.path !== file.path),
							modified: prev.modified.filter((p) => p !== file.path),
							created: prev.created.filter((p) => p !== file.path),
							deleted: prev.deleted.filter((p) => p !== file.path),
							not_added: prev.not_added.filter((p) => p !== file.path),
						}
					: prev,
			);
			if (selectedFile === file.path) {
				setSelectedFile(null);
			}
		} finally {
			setDiscarding((prev) => {
				const next = new Set(prev);
				next.delete(file.path);
				return next;
			});
		}
	};

	const allFiles: GitStatusFile[] = status?.files ?? [];
	const totalChanges = allFiles.length;

	return (
		<div className="flex flex-col h-dvh">
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
				<button
					type="button"
					onClick={onBack}
					className="cursor-pointer p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
					title="Back to preview"
				>
					<ArrowLeft className="w-4 h-4" />
				</button>

				<div className="h-4 w-px bg-border mx-0.5" />

				<div className="flex items-center gap-2 min-w-0 flex-1">
					<FileDiff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span className="text-sm font-medium truncate">{env.name}</span>
					{status?.current && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
							<GitBranch className="w-3 h-3" />
							{status.current}
						</span>
					)}
					{!statusLoading && (
						<span className="text-xs text-muted-foreground shrink-0">
							{totalChanges} file{totalChanges !== 1 ? "s" : ""} changed
						</span>
					)}
				</div>

				<div className="flex items-center gap-1.5 shrink-0">
					<a
						href={`${env.url}?__cb=${crypto.randomUUID()}`}
						target="_blank"
						rel="noreferrer"
						className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
					>
						<ExternalLink className="w-3 h-3" />
						Preview
					</a>
					{publishState === "success" ? (
						<span className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-success/10 text-success text-xs font-medium">
							<CheckCircle2 className="w-3 h-3" />
							Published
						</span>
					) : (
						<button
							type="button"
							onClick={handlePublish}
							disabled={
								publishState === "publishing" ||
								totalChanges === 0 ||
								statusLoading
							}
							className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{publishState === "publishing" ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<Upload className="w-3 h-3" />
							)}
							{publishState === "publishing" ? "Publishing…" : "Publish"}
						</button>
					)}
				</div>
			</div>

			{publishState === "error" && publishError && (
				<div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive">
					{publishError}
				</div>
			)}

			{publishState === "success" && publishCommit && (
				<div className="px-4 py-2 bg-success/10 border-b border-success/20 text-xs text-success flex items-center gap-2">
					<CheckCircle2 className="w-3 h-3" />
					Commit <span className="font-mono">{publishCommit.slice(0, 7)}</span>{" "}
					pushed to {status?.tracking ?? "origin"}
				</div>
			)}

			{/* Body */}
			<div className="flex flex-1 overflow-hidden">
				{/* File list */}
				<div className="w-56 shrink-0 border-r border-border overflow-y-auto bg-muted/20">
					{statusLoading ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
						</div>
					) : allFiles.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
							<CheckCircle2 className="w-5 h-5 text-success/60" />
							<p className="text-xs text-muted-foreground">No changes</p>
						</div>
					) : (
						<div className="py-1">
							{allFiles.map((file) => {
								const { label, color } = fileStatusLabel(file);
								const isSelected = selectedFile === file.path;
								const isDiscarding = discarding.has(file.path);
								const shortPath = file.path.split("/").pop() ?? file.path;
								return (
									<div
										key={file.path}
										className={cn(
											"group flex items-center gap-1 px-2 py-1 transition-colors",
											isSelected ? "bg-accent" : "hover:bg-accent/50",
										)}
									>
										<button
											type="button"
											onClick={() => selectFile(file.path)}
											title={file.path}
											className="cursor-pointer flex items-center gap-2 flex-1 min-w-0 text-left"
											disabled={isDiscarding}
										>
											<FileText className="w-3 h-3 text-muted-foreground shrink-0" />
											<span className="text-xs truncate flex-1 min-w-0">
												{shortPath}
											</span>
											<span
												className={cn(
													"text-xs font-bold font-mono shrink-0",
													color,
												)}
											>
												{label}
											</span>
										</button>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleDiscard(file);
											}}
											disabled={isDiscarding}
											title="Discard changes"
											className="cursor-pointer shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isDiscarding ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<Undo2 className="w-3 h-3" />
											)}
										</button>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Diff pane */}
				<div className="flex-1 overflow-hidden bg-background">
					{statusLoading ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
						</div>
					) : !selectedFile ? (
						<div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
							<FileDiff className="w-8 h-8 opacity-20" />
							<p className="text-sm">
								{allFiles.length > 0
									? "Select a file to view its diff"
									: "No changes to show"}
							</p>
						</div>
					) : (
						(() => {
							const fileDiff = getDiffForFile(selectedFile);
							return fileDiff ? (
								<div className="flex flex-col h-full overflow-hidden">
									<div className="px-4 py-2 border-b border-border bg-muted/20 shrink-0">
										<p
											className="text-xs font-mono text-muted-foreground truncate"
											title={selectedFile}
										>
											{selectedFile}
										</p>
									</div>
									<div className="flex-1 overflow-hidden">
										<DiffViewer diff={fileDiff} />
									</div>
								</div>
							) : (
								<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
									No diff available for this file
								</div>
							);
						})()
					)}
				</div>
			</div>
		</div>
	);
}

// ─── shared page shell ────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
	return <div className="p-5 min-h-dvh">{children}</div>;
}

function Spinner({ label }: { label?: string }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
				{label && <span className="text-sm">{label}</span>}
			</div>
		</div>
	);
}

function ErrorView({ error }: { error?: string }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className="w-full max-w-md border-destructive/40">
				<CardHeader>
					<CardTitle className="text-destructive text-base">Error</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						{error ?? "Unknown error"}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

function CancelledView() {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className="w-full max-w-md">
				<CardContent className="pt-6">
					<p className="text-sm text-muted-foreground text-center">
						Tool call was cancelled.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

// ─── DeleteEnvironmentPage ────────────────────────────────────────────────────

export function DeleteEnvironmentPage() {
	const state = useMcpState<DeleteEnvironmentInput, DeleteEnvironmentOutput>();

	if (state.status === "initializing")
		return <Spinner label="Connecting to host..." />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">Delete Environment</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								delete_environment
							</Badge>{" "}
							to remove an environment.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		const name = state.toolInput?.name ?? "environment";
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex flex-col items-center gap-5 max-w-xs text-center">
					<div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
						<Trash2 className="w-5 h-5 text-destructive/70 animate-pulse" />
					</div>
					<div className="space-y-1.5">
						<p className="text-sm font-medium">Deleting environment</p>
						<p className="text-xs text-muted-foreground">
							Removing{" "}
							<span className="font-mono text-foreground/70">{name}</span>…
						</p>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<span className="w-3 h-3 border-2 border-muted border-t-destructive/50 rounded-full animate-spin" />
						This may take a moment
					</div>
				</div>
			</div>
		);
	}

	const { deleted, name, site, message } = state.toolResult ?? {
		deleted: false,
		name: "",
		site: "",
		message: "",
	};

	if (!deleted) {
		return (
			<PageShell>
				<div className="flex flex-col items-center gap-5 py-16 max-w-xs mx-auto text-center">
					<div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
						<AlertTriangle className="w-5 h-5 text-destructive/70" />
					</div>
					<div className="space-y-1.5">
						<p className="text-sm font-medium">Deletion failed</p>
						<p className="text-xs text-muted-foreground">{message}</p>
					</div>
				</div>
			</PageShell>
		);
	}

	return (
		<PageShell>
			<div className="flex flex-col items-center gap-5 py-16 max-w-xs mx-auto text-center">
				<div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
					<CheckCircle2 className="w-5 h-5 text-success" />
				</div>
				<div className="space-y-1.5">
					<p className="text-sm font-medium">Environment deleted</p>
					<p className="text-xs text-muted-foreground">
						<span className="font-mono text-foreground/70">{name}</span> has
						been removed from{" "}
						<span className="font-mono text-foreground/70">{site}</span>.
					</p>
				</div>
			</div>
		</PageShell>
	);
}

// ─── EnvironmentsList ─────────────────────────────────────────────────────────

function EnvironmentsList({
	initialEnvironments,
	site,
}: {
	initialEnvironments: AdminEnvironment[];
	site: string;
}) {
	const app = useMcpApp();
	const [environments, setEnvironments] =
		useState<AdminEnvironment[]>(initialEnvironments);
	const [selectedEnv, setSelectedEnv] = useState<AdminEnvironment | null>(null);
	const [search, setSearch] = useState("");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [createName, setCreateName] = useState("");
	const [createState, setCreateState] = useState<"idle" | "creating" | "error">(
		"idle",
	);
	const [createError, setCreateError] = useState<string>();

	const handleDelete = useCallback(
		async (name: string) => {
			const result = await app?.callServerTool({
				name: "delete_environment",
				arguments: { name },
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Delete failed");
			}
		},
		[app],
	);

	const handleDeleted = (name: string) => {
		setEnvironments((prev) => prev.filter((e) => e.name !== name));
	};

	const openDialog = () => {
		setCreateName("");
		setCreateState("idle");
		setCreateError(undefined);
		setDialogOpen(true);
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!createName.trim()) return;
		setCreateState("creating");
		setCreateError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "create_environment",
				arguments: {
					name: createName.trim(),
					platform: "sandbox",
				},
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Create failed");
			}
			const data = result?.structuredContent as
				| CreateEnvironmentOutput
				| undefined;
			if (data?.environment) {
				setEnvironments((prev) => [data.environment, ...prev]);
			}
			setDialogOpen(false);
			setCreateState("idle");
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : "Unknown error");
			setCreateState("error");
		}
	};

	const filtered = search.trim()
		? environments.filter(
				(e) =>
					e.name.toLowerCase().includes(search.toLowerCase()) ||
					e.url?.toLowerCase().includes(search.toLowerCase()) ||
					e.upstream?.toLowerCase().includes(search.toLowerCase()),
			)
		: environments;

	if (selectedEnv) {
		return (
			<EnvironmentPreview
				env={selectedEnv}
				onBack={() => setSelectedEnv(null)}
			/>
		);
	}

	return (
		<PageShell>
			<div className="space-y-4">
				{/* Header */}
				<div className="flex items-start justify-between gap-3 pb-1">
					<div>
						<h1 className="text-base font-semibold">Environments</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							{site && <span>{site} &middot; </span>}
							{environments.length} environment
							{environments.length !== 1 ? "s" : ""}
						</p>
					</div>
					<Button
						size="sm"
						className="gap-1.5 shrink-0 h-8"
						onClick={openDialog}
					>
						<Plus className="w-3.5 h-3.5" />
						New
					</Button>
				</div>

				{/* Create dialog */}
				<Dialog
					open={dialogOpen}
					onOpenChange={(open) => {
						if (!open && createState !== "creating") setDialogOpen(false);
					}}
				>
					<DialogContent className="max-w-sm">
						<DialogHeader>
							<DialogTitle className="text-base">
								New sandbox environment
							</DialogTitle>
						</DialogHeader>
						<form onSubmit={handleCreate} className="space-y-4">
							<div className="space-y-3">
								<div className="flex flex-col gap-1.5">
									<label
										htmlFor="create-env-name"
										className="text-xs font-medium text-muted-foreground"
									>
										Name <span className="text-destructive">*</span>
									</label>
									<Input
										id="create-env-name"
										placeholder="e.g. my-feature"
										value={createName}
										onChange={(e) => setCreateName(e.target.value)}
										className="h-8 text-sm"
										required
										autoFocus
										disabled={createState === "creating"}
									/>
								</div>
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
									<span>Platform:</span>
									<Badge variant="secondary" className="font-mono text-xs">
										sandbox
									</Badge>
								</div>
							</div>
							{createError && (
								<p className="text-xs text-destructive">{createError}</p>
							)}
							<DialogFooter>
								<Button
									type="submit"
									size="sm"
									className="gap-1.5"
									disabled={!createName.trim() || createState === "creating"}
								>
									{createState === "creating" && (
										<span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
									)}
									{createState === "creating" ? "Creating…" : "Create"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>

				{/* Search */}
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Filter by name, URL or branch…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9 h-8 text-sm"
					/>
				</div>

				{/* Grid / empty state */}
				{filtered.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
						<Globe className="w-8 h-8 opacity-30" />
						<p className="text-sm">
							{search
								? `No environments match "${search}"`
								: "No environments yet"}
						</p>
						{!search && (
							<Button
								variant="outline"
								size="sm"
								onClick={openDialog}
								className="gap-1.5 mt-1 h-8"
							>
								<Plus className="w-3.5 h-3.5" />
								New environment
							</Button>
						)}
					</div>
				) : (
					<div className="grid gap-2.5 sm:grid-cols-2">
						{filtered.map((env) => (
							<EnvironmentCard
								key={env.name}
								env={env}
								onClick={() => setSelectedEnv(env)}
								onDelete={handleDelete}
								onDeleted={handleDeleted}
							/>
						))}
					</div>
				)}
			</div>
		</PageShell>
	);
}

// ─── ListEnvironmentsPage ─────────────────────────────────────────────────────

export function ListEnvironmentsPage() {
	const state = useMcpState<ListEnvironmentsInput, ListEnvironmentsOutput>();

	if (state.status === "initializing")
		return <Spinner label="Connecting to host..." />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">Environments</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								list_environments
							</Badge>{" "}
							to see all environments.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return <Spinner label="Fetching environments..." />;
	}

	const { environments, site } = state.toolResult ?? {
		environments: [],
		site: "",
	};

	return <EnvironmentsList initialEnvironments={environments} site={site} />;
}
