import {
	AlertTriangle,
	Check,
	CheckCircle2,
	GitBranch,
	HardDrive,
	Loader2,
	RefreshCw,
	X,
	Zap,
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
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	CfbSetupInput,
	CfbSetupOutput,
	CfbSetupStatusOutput,
	SetupError,
} from "../../../api/tools/cfb-setup.ts";

type AnyOutput = CfbSetupOutput | CfbSetupStatusOutput;

function isSetupResult(o: AnyOutput): o is CfbSetupOutput {
	return "ok" in o && "errors" in o;
}

// ─── StatusRow ────────────────────────────────────────────────────────────────

function StatusRow({
	label,
	ok,
	detail,
	Icon,
}: {
	label: string;
	ok: boolean;
	detail?: string;
	Icon: typeof GitBranch;
}) {
	return (
		<div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
			<Icon className="w-4 h-4 text-muted-foreground shrink-0" />
			<span className="text-sm flex-1">{label}</span>
			<span className="text-xs text-muted-foreground truncate max-w-[200px]">
				{detail}
			</span>
			{ok ? (
				<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
			) : (
				<X className="w-4 h-4 text-muted-foreground shrink-0" />
			)}
		</div>
	);
}

// ─── ErrorList ────────────────────────────────────────────────────────────────

function ErrorList({ errors }: { errors: SetupError[] }) {
	if (errors.length === 0) return null;
	return (
		<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
			<div className="flex items-center gap-2 text-sm font-medium text-destructive">
				<AlertTriangle className="w-4 h-4" />
				{errors.length} step{errors.length === 1 ? "" : "s"} failed
			</div>
			<ul className="space-y-1.5 text-sm">
				{errors.map((e, idx) => (
					<li
						key={`${e.step}-${idx}`}
						className="flex flex-col gap-0.5 text-muted-foreground"
					>
						<span>
							<code className="font-mono text-xs text-foreground">
								{e.step}
							</code>{" "}
							· <span className="text-foreground">{e.message}</span>
							{e.cfErrorCode !== undefined ? (
								<span className="ml-1 text-xs">(CF {e.cfErrorCode})</span>
							) : null}
						</span>
						{e.hint && <span className="text-xs">{e.hint}</span>}
					</li>
				))}
			</ul>
		</div>
	);
}

// ─── SetupView ────────────────────────────────────────────────────────────────

function SetupView({ data }: { data: AnyOutput }) {
	const app = useMcpApp();
	const [running, setRunning] = useState(false);
	const [latest, setLatest] = useState<AnyOutput>(data);

	const result: CfbSetupOutput | null = isSetupResult(latest) ? latest : null;
	const status: CfbSetupStatusOutput | null = isSetupResult(latest)
		? null
		: latest;

	const workerName = latest.workerName;
	const workerTag = latest.workerTag;
	const workerExists = latest.workerExists;
	const repoConnected = result
		? !!result.repoConnectionId
		: !!status?.repoConnected;
	const prodTriggerUuid = result
		? result.prodTriggerUuid
		: (status?.prodTrigger?.trigger_uuid ?? null);
	const previewTriggerUuid = result
		? result.previewTriggerUuid
		: (status?.previewTrigger?.trigger_uuid ?? null);

	const allWired =
		workerExists && repoConnected && !!prodTriggerUuid && !!previewTriggerUuid;
	const errors = result?.errors ?? [];

	const handleSetup = async () => {
		if (!app) return;
		setRunning(true);
		try {
			const res = await app.callServerTool({
				name: "cfb_setup",
				arguments: {} satisfies CfbSetupInput,
			});
			const text = res?.content?.find((c) => c.type === "text");
			if (text?.type === "text") {
				try {
					setLatest(JSON.parse(text.text) as CfbSetupOutput);
				} catch {
					// keep previous
				}
			}
		} finally {
			setRunning(false);
		}
	};

	return (
		<section className="flex flex-col gap-5">
			<header className="flex items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-medium">Cloudflare Workers Builds</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Worker:{" "}
						<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
							{workerName}
						</code>
						{workerTag ? (
							<>
								{" · tag "}
								<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
									{workerTag.slice(0, 12)}
								</code>
							</>
						) : null}
					</p>
				</div>
				{allWired ? (
					<Badge
						variant="secondary"
						className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					>
						<Check className="w-3 h-3" />
						Fully wired
					</Badge>
				) : (
					<Badge variant="secondary">Needs setup</Badge>
				)}
			</header>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Setup state</CardTitle>
				</CardHeader>
				<CardContent>
					<StatusRow
						label="GitHub repo connected"
						ok={repoConnected}
						Icon={GitBranch}
					/>
					<StatusRow
						label="Worker script exists"
						ok={workerExists}
						detail={workerName}
						Icon={HardDrive}
					/>
					<StatusRow
						label="Production build trigger"
						ok={!!prodTriggerUuid}
						detail={prodTriggerUuid?.slice(0, 8)}
						Icon={Zap}
					/>
					<StatusRow
						label="Preview build trigger"
						ok={!!previewTriggerUuid}
						detail={previewTriggerUuid?.slice(0, 8)}
						Icon={Zap}
					/>
				</CardContent>
			</Card>

			<ErrorList errors={errors} />

			<div className="flex items-center gap-2">
				<Button
					onClick={handleSetup}
					disabled={running}
					className={cn("gap-2", allWired && "bg-muted-foreground/10")}
					variant={allWired ? "outline" : "default"}
				>
					{running ? (
						<>
							<Loader2 className="w-4 h-4 animate-spin" />
							Running…
						</>
					) : (
						<>
							<RefreshCw className="w-4 h-4" />
							{allWired ? "Re-run setup (idempotent)" : "Run setup"}
						</>
					)}
				</Button>
				{result && (
					<span className="text-xs text-muted-foreground">
						{result.ok ? "Last run succeeded" : "Last run had errors"}
					</span>
				)}
			</div>
		</section>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CfbSetupPage() {
	const state = useMcpState<unknown, AnyOutput>();

	if (state.status === "initializing" || state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<Loader2 className="w-4 h-4 animate-spin" />
					<span className="text-sm">
						{state.status === "tool-input" ? "Working…" : "Connecting to host…"}
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
						<CardTitle className="text-base">
							Cloudflare Workers Builds
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								cfb_setup_status
							</Badge>{" "}
							or{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								cfb_setup
							</Badge>{" "}
							to begin.
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

	if (!state.toolResult) return null;

	return (
		<div className="mx-auto w-full max-w-[800px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
			<SetupView data={state.toolResult} />
		</div>
	);
}
