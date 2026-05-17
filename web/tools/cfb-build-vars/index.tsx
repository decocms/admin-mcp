import { AlertTriangle, CheckCircle2, Loader2, Variable } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table.tsx";
import { useMcpState } from "@/context.tsx";
import type {
	BuildVarsResult,
	CfbDeleteBuildVarOutput,
	CfbListBuildVarsOutput,
	CfbSetBuildVarOutput,
} from "../../../api/tools/cfb-build-vars.ts";

type AnyOutput =
	| CfbListBuildVarsOutput
	| CfbSetBuildVarOutput
	| CfbDeleteBuildVarOutput;

function VarsTable({ data }: { data: BuildVarsResult }) {
	const entries = Object.entries(data.buildVars);

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="text-sm flex items-center gap-2">
						<Variable className="w-4 h-4 text-muted-foreground" />
						Build vars ({entries.length})
					</CardTitle>
					<Badge variant="secondary" className="font-mono text-xs">
						trigger {data.triggerUuid.slice(0, 8)}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{entries.length === 0 ? (
					<div className="p-6 text-center text-sm text-muted-foreground border-t border-border">
						No build vars. Use{" "}
						<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
							cfb_set_build_var
						</code>{" "}
						to add one.
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[40%]">Name</TableHead>
								<TableHead>Value</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.map(([name, value]) => (
								<TableRow key={name}>
									<TableCell className="font-mono text-sm">{name}</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground break-all">
										{value}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

export default function CfbBuildVarsPage() {
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
						<CardTitle className="text-base">Build vars</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								cfb_list_build_vars
							</Badge>{" "}
							to view build-time variables.
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

	const justChanged =
		state.toolName === "cfb_set_build_var" ||
		state.toolName === "cfb_delete_build_var";

	return (
		<div className="mx-auto w-full max-w-[800px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10 flex flex-col gap-5">
			<header>
				<h1 className="text-xl font-medium">Build-time variables</h1>
				<p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
					<AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
					Values are plain-text and visible to anyone with site access. Use{" "}
					<code className="font-mono text-xs">cfb_set_secret</code> for
					sensitive values.
				</p>
			</header>

			{justChanged && (
				<div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
					<CheckCircle2 className="w-4 h-4" />
					{state.toolName === "cfb_set_build_var"
						? "Build var updated."
						: "Build var removed."}
				</div>
			)}

			<VarsTable data={result} />
		</div>
	);
}
