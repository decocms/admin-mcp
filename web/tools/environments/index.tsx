import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import { Input } from "@/components/ui/input.tsx";
import {
	ArrowLeft,
	Box,
	Check,
	Copy,
	ExternalLink,
	GitBranch,
	Globe,
	Plus,
	RefreshCw,
	Search,
	Server,
} from "lucide-react";
import { useState } from "react";
import type {
	AdminEnvironment,
	ListEnvironmentsInput,
	ListEnvironmentsOutput,
} from "../../../api/tools/environments.ts";

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

function UrlRow({ label, url }: { label: string; url: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 py-0.5">
				<code className="flex-1 text-xs truncate text-foreground/80 py-0.5">
					{url}
				</code>
				<CopyButton text={url} />
				<a
					href={url}
					target="_blank"
					rel="noreferrer"
					className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
					title="Open"
				>
					<ExternalLink className="w-3.5 h-3.5" />
				</a>
			</div>
		</div>
	);
}

function EnvironmentCard({
	env,
	onClick,
}: {
	env: AdminEnvironment;
	onClick: () => void;
}) {
	return (
		<button type="button" className="text-left w-full group cursor-pointer" onClick={onClick}>
			<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm cursor-pointer">
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
					<StatusBadge platform={env.platform} />
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
			</div>
		</button>
	);
}

// ─── EnvironmentPreview ───────────────────────────────────────────────────────

function EnvironmentPreview({
	env,
	onBack,
}: {
	env: AdminEnvironment;
	onBack: () => void;
}) {
	const [previewUrl, setPreviewUrl] = useState(
		() => `${env.url}?__cb=${crypto.randomUUID()}`,
	);

	const refresh = () => setPreviewUrl(`${env.url}?__cb=${crypto.randomUUID()}`);

	return (
		<div className="flex flex-col h-dvh">
			{/* Toolbar */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
				<button
					type="button"
					onClick={onBack}
					className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
					title="Back to list"
				>
					<ArrowLeft className="w-4 h-4" />
				</button>

				<div className="h-4 w-px bg-border mx-0.5" />

				<div className="flex items-center gap-2 min-w-0 flex-1">
					<span className="text-sm font-medium truncate">{env.name}</span>
					<StatusBadge platform={env.platform} />
				</div>

				<div className="flex items-center gap-0.5 shrink-0">
					<button
						type="button"
						onClick={refresh}
						className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
						title="Refresh preview"
					>
						<RefreshCw className="w-3.5 h-3.5" />
					</button>
					<CopyButton text={env.url ?? ""} />
					<a
						href={previewUrl}
						target="_blank"
						rel="noreferrer"
						className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
						title="Open in browser"
					>
						<ExternalLink className="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			{/* iframe */}
			<iframe
				key={previewUrl}
				src={previewUrl}
				title={`Preview of ${env.name}`}
				className="flex-1 w-full border-0"
			/>
		</div>
	);
}

function EnvironmentDetail({
	environment,
	previewUrl,
	site,
}: {
	environment: AdminEnvironment;
	previewUrl: string;
	site: string;
}) {
	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-base font-semibold flex items-center gap-2">
						<Server className="w-4 h-4 text-muted-foreground" />
						{environment.name}
					</h1>
					<p className="text-sm text-muted-foreground mt-0.5">{site}</p>
				</div>
				<StatusBadge platform={environment.platform} />
			</div>

			<div className="grid gap-2.5">
				{environment.upstream && (
					<div className="flex items-center gap-2 text-sm">
						<GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<span className="text-muted-foreground">Branch</span>
						<Badge variant="secondary" className="font-mono text-xs">
							{environment.upstream}
						</Badge>
					</div>
				)}
				{environment.head && (
					<div className="flex items-center gap-2 text-sm">
						<Box className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<span className="text-muted-foreground">Commit</span>
						<code className="text-xs bg-muted border border-border/50 px-1.5 py-0.5 rounded-md font-mono">
							{environment.head.slice(0, 8)}
						</code>
					</div>
				)}
				{environment.createdAt && (
					<p className="text-xs text-muted-foreground">
						Created {new Date(environment.createdAt).toLocaleString()}
					</p>
				)}
			</div>

			<div className="space-y-2.5">
				{environment.url && (
					<UrlRow label="Environment URL" url={environment.url} />
				)}
				<UrlRow label="Preview URL" url={previewUrl} />
			</div>

			{(environment.public || environment.readonly || environment.transient) && (
				<div className="flex gap-1.5 flex-wrap">
					{environment.public && <Badge variant="outline">public</Badge>}
					{environment.readonly && <Badge variant="outline">read-only</Badge>}
					{environment.transient && <Badge variant="outline">transient</Badge>}
				</div>
			)}
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

// ─── ListEnvironmentsPage ─────────────────────────────────────────────────────

export function ListEnvironmentsPage() {
	const state = useMcpState<ListEnvironmentsInput, ListEnvironmentsOutput>();
	const [selectedEnv, setSelectedEnv] = useState<AdminEnvironment | null>(null);
	const [search, setSearch] = useState("");

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
					<div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
						<Globe className="w-4 h-4 text-muted-foreground" />
					</div>
				</div>

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
						<Plus className="w-8 h-8 opacity-30" />
						<p className="text-sm">
							{search
								? `No environments match "${search}"`
								: "No environments yet"}
						</p>
					</div>
				) : (
					<div className="grid gap-2.5 sm:grid-cols-2">
						{filtered.map((env) => (
							<EnvironmentCard
								key={env.name}
								env={env}
								onClick={() => setSelectedEnv(env)}
							/>
						))}
					</div>
				)}
			</div>
		</PageShell>
	);
}
