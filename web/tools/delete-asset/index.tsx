import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import { CheckCircle2, Trash2 } from "lucide-react";
import type {
	DeleteAssetOutput,
} from "../../../api/tools/delete-asset.ts";

export default function DeleteAssetPage() {
	const state = useMcpState<Record<string, never>, DeleteAssetOutput>();

	if (state.status === "initializing" || state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Connecting...</span>
				</div>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<Trash2 className="w-4 h-4 animate-pulse" />
					<span className="text-sm">Deleting asset...</span>
				</div>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive text-base">
							Delete Failed
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-destructive">
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
							Delete cancelled.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const result = state.toolResult;
	if (!result) return null;

	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className="w-full max-w-sm border-green-500/30">
				<CardHeader className="pb-3">
					<div className="flex items-center gap-2">
						<CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
						<CardTitle className="text-base">Asset Deleted</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
						<span className="text-muted-foreground">ID: </span>
						<span className="font-mono font-medium">{result.id}</span>
					</div>
					<div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
						<span className="text-muted-foreground">Site: </span>
						<span className="font-medium">{result.sitename}</span>
					</div>
					<p className="text-xs text-muted-foreground pt-1">
						{result.message}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
