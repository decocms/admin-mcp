import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Loader2,
	RotateCcw,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import type {
	CfbListVersionsOutput,
	CfbRollbackOutput,
	VersionRow,
} from "../../../api/tools/cfb-versions.ts";

type AnyOutput = CfbListVersionsOutput | CfbRollbackOutput;

function shortId(id: string) {
	return id.slice(0, 8);
}

function formatDate(iso?: string) {
	if (!iso) return "—";
	return new Date(iso).toLocaleString();
}

// ─── RollbackDialog ───────────────────────────────────────────────────────────

type DialogState = "idle" | "running" | "done" | "error";

function RollbackDialog({
	version,
	onClose,
}: {
	version: VersionRow | null;
	onClose: () => void;
}) {
	const app = useMcpApp();
	const [state, setState] = useState<DialogState>("idle");
	const [error, setError] = useState<string>();
	const [warnings, setWarnings] = useState<string[]>([]);

	if (!version) return null;

	const handleRollback = async () => {
		if (!app) return;
		setState("running");
		setError(undefined);
		try {
			const res = await app.callServerTool({
				name: "cfb_rollback",
				arguments: { versionId: version.id },
			});
			if (res?.isError) {
				const text = res.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Rollback failed");
			}
			const text = res?.content?.find((c) => c.type === "text");
			if (text?.type === "text") {
				try {
					const parsed = JSON.parse(text.text) as CfbRollbackOutput;
					setWarnings(parsed.warnings ?? []);
				} catch {
					// no warnings parsed
				}
			}
			setState("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Rollback failed");
			setState("error");
		}
	};

	const handleClose = () => {
		setState("idle");
		setError(undefined);
		setWarnings([]);
		onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<RotateCcw className="w-4 h-4" />
						Roll back to version
					</DialogTitle>
					<DialogDescription>
						This creates a new deployment that sends 100% of traffic to version{" "}
						<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
							{shortId(version.id)}
						</code>
						. Cloudflare may reject the rollback if the version's bindings have
						incompatible data shapes (D1, R2, KV, DO).
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex gap-2">
					<AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
					<div className="text-muted-foreground">
						Rolling back does NOT revert build vars — vars are part of the new
						deployment.
					</div>
				</div>

				{state === "done" && (
					<div className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
						<CheckCircle2 className="w-4 h-4" />
						Rollback applied.
					</div>
				)}
				{warnings.length > 0 && (
					<ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
						{warnings.map((w) => (
							<li key={w}>{w}</li>
						))}
					</ul>
				)}
				{state === "error" && (
					<p className="text-sm text-destructive">{error}</p>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={state === "running"}
					>
						{state === "done" ? "Close" : "Cancel"}
					</Button>
					{state !== "done" && (
						<Button
							onClick={handleRollback}
							disabled={state === "running"}
							className="gap-2"
						>
							{state === "running" ? (
								<>
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
									Rolling back…
								</>
							) : (
								<>Confirm rollback</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── VersionsTable ────────────────────────────────────────────────────────────

function VersionsTable({ versions }: { versions: VersionRow[] }) {
	const [target, setTarget] = useState<VersionRow | null>(null);

	return (
		<>
			<Card className="overflow-hidden p-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[140px]">Version</TableHead>
							<TableHead className="w-[80px]">#</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Status</TableHead>
							<TableHead className="w-[140px] text-right" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{versions.map((v) => (
							<TableRow key={v.id}>
								<TableCell className="font-mono text-xs">
									{shortId(v.id)}
								</TableCell>
								<TableCell className="font-mono text-xs text-muted-foreground">
									{v.number ?? "—"}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									<span className="inline-flex items-center gap-1">
										<Clock className="w-3 h-3" />
										{formatDate(v.created_on)}
									</span>
								</TableCell>
								<TableCell>
									{v.isActive ? (
										<Badge
											variant="secondary"
											className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
										>
											<CheckCircle2 className="w-3 h-3" />
											Active
										</Badge>
									) : (
										<Badge variant="secondary" className="text-xs">
											Available
										</Badge>
									)}
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="outline"
										size="sm"
										className="gap-1.5 h-8"
										disabled={v.isActive}
										onClick={() => setTarget(v)}
										title={v.isActive ? "Already active" : undefined}
									>
										<RotateCcw className="w-3 h-3" />
										Rollback
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Card>
			<RollbackDialog version={target} onClose={() => setTarget(null)} />
		</>
	);
}

// ─── RollbackResultView ───────────────────────────────────────────────────────

function RollbackResultView({ result }: { result: CfbRollbackOutput }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4 text-emerald-500" />
					Rollback applied
				</CardTitle>
			</CardHeader>
			<CardContent className="text-sm space-y-3">
				<div>
					<span className="text-muted-foreground">Deployment id:</span>{" "}
					<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
						{result.deployment.id}
					</code>
				</div>
				{result.warnings.length > 0 && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1.5">
						<div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
							<AlertTriangle className="w-3.5 h-3.5" />
							{result.warnings.length} warning
							{result.warnings.length === 1 ? "" : "s"}
						</div>
						<ul className="text-muted-foreground list-disc pl-4 space-y-1">
							{result.warnings.map((w) => (
								<li key={w}>{w}</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CfbVersionsPage() {
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
						<CardTitle className="text-base">Versions</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								cfb_list_versions
							</Badge>{" "}
							to view the last 100 Worker versions.
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
		<div className="mx-auto w-full max-w-[1000px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10 flex flex-col gap-5">
			{state.toolName === "cfb_list_versions" && "versions" in result ? (
				<>
					<header>
						<h1 className="text-xl font-medium">Worker versions</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							Last 100 versions. The active version receives 100% of traffic
							unless a gradual deployment is in progress.
						</p>
					</header>
					<VersionsTable
						versions={(result as CfbListVersionsOutput).versions}
					/>
				</>
			) : (
				<RollbackResultView result={result as CfbRollbackOutput} />
			)}
		</div>
	);
}
