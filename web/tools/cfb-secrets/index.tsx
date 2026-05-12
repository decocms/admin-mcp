import { CheckCircle2, Key, Loader2, Trash2 } from "lucide-react";
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
	CfbDeleteSecretOutput,
	CfbListSecretsOutput,
	CfbSetSecretOutput,
	WorkerSecretBinding,
} from "../../../api/tools/cfb-secrets.ts";

type AnyOutput =
	| CfbListSecretsOutput
	| CfbSetSecretOutput
	| CfbDeleteSecretOutput;

function isListOutput(o: AnyOutput): o is CfbListSecretsOutput {
	return "secrets" in o && Array.isArray((o as CfbListSecretsOutput).secrets);
}

function isDeleteOutput(o: AnyOutput): o is CfbDeleteSecretOutput {
	return "ok" in o && "name" in o;
}

function isSetOutput(o: AnyOutput): o is CfbSetSecretOutput {
	return "name" in o && "type" in o;
}

// ─── views ────────────────────────────────────────────────────────────────────

function SecretsTable({ secrets }: { secrets: WorkerSecretBinding[] }) {
	if (secrets.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
				<Key className="w-6 h-6 mx-auto mb-2 opacity-40" />
				No secrets set. Use{" "}
				<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
					cfb_set_secret
				</code>{" "}
				to add one.
			</div>
		);
	}

	return (
		<Card>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead className="w-[160px]">Type</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{secrets.map((s) => (
						<TableRow key={s.name}>
							<TableCell className="font-mono text-sm">{s.name}</TableCell>
							<TableCell>
								<Badge variant="secondary" className="font-mono text-xs">
									{s.type}
								</Badge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

function SetSuccess({ binding }: { binding: CfbSetSecretOutput }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4 text-emerald-500" />
					Secret saved
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Name:</span>
					<code className="font-mono bg-muted px-1.5 py-0.5 rounded">
						{binding.name}
					</code>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Type:</span>
					<Badge variant="secondary" className="font-mono text-xs">
						{binding.type}
					</Badge>
				</div>
				<p className="text-xs text-muted-foreground pt-2">
					Cloudflare never returns secret values — the value you set is now
					encrypted at rest on the Worker.
				</p>
			</CardContent>
		</Card>
	);
}

function DeleteSuccess({ result }: { result: CfbDeleteSecretOutput }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<Trash2 className="w-4 h-4 text-muted-foreground" />
					Secret deleted
				</CardTitle>
			</CardHeader>
			<CardContent className="text-sm">
				<code className="font-mono bg-muted px-1.5 py-0.5 rounded">
					{result.name}
				</code>{" "}
				is no longer bound to the Worker.
			</CardContent>
		</Card>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CfbSecretsPage() {
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
						<CardTitle className="text-base">Secrets</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								cfb_list_secrets
							</Badge>{" "}
							to view the secrets bound to this Worker.
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
		<div className="mx-auto w-full max-w-[800px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10 flex flex-col gap-5">
			<header>
				<h1 className="text-xl font-medium">Worker secrets</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Runtime secrets bound to the Cloudflare Worker. Values are never
					returned by Cloudflare.
				</p>
			</header>
			{isListOutput(result) ? (
				<SecretsTable secrets={result.secrets} />
			) : isDeleteOutput(result) ? (
				<DeleteSuccess result={result} />
			) : isSetOutput(result) ? (
				<SetSuccess binding={result} />
			) : null}
		</div>
	);
}
