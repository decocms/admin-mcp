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
	CreateEnvironmentInput,
	CreateEnvironmentOutput,
	GetEnvironmentInput,
	GetEnvironmentOutput,
	ListEnvironmentsInput,
	ListEnvironmentsOutput,
	PreviewEnvironmentInput,
	PreviewEnvironmentOutput,
} from "../../../api/tools/environments.ts";

// ─── shared components ────────────────────────────────────────────────────────

function StatusBadge({ platform }: { platform?: string }) {
	const color =
		platform === "sandbox"
			? "bg-purple-100 text-purple-700"
			: platform === "content"
				? "bg-blue-100 text-blue-700"
				: platform === "tunnel"
					? "bg-yellow-100 text-yellow-700"
					: "bg-green-100 text-green-700";
	return (
		<span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", color)}>
			{platform ?? "deco"}
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
			className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
			title="Copy"
		>
			{copied ? (
				<Check className="w-3.5 h-3.5 text-green-500" />
			) : (
				<Copy className="w-3.5 h-3.5 text-muted-foreground" />
			)}
		</button>
	);
}

function UrlRow({ label, url }: { label: string; url: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">{label}</span>
			<div className="flex items-center gap-1">
				<code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">
					{url}
				</code>
				<CopyButton text={url} />
				<a
					href={url}
					target="_blank"
					rel="noreferrer"
					className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
					title="Open"
				>
					<ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
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
		<button
			type="button"
			className="text-left w-full"
			onClick={onClick}
		>
			<Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer">
				<CardContent className="pt-4 space-y-3">
					<div className="flex items-start justify-between gap-2">
						<div className="flex items-center gap-2 min-w-0">
							<Server className="w-4 h-4 text-muted-foreground shrink-0" />
							<span className="font-medium text-sm truncate">{env.name}</span>
						</div>
						<StatusBadge platform={env.platform} />
					</div>

					{(env.upstream ?? env.head) && (
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<GitBranch className="w-3 h-3 shrink-0" />
							<span className="truncate">
								{env.upstream ?? env.head?.slice(0, 8)}
							</span>
						</div>
					)}

					{env.url && (
						<code className="block text-xs bg-muted rounded px-2 py-1 truncate text-muted-foreground">
							{env.url}
						</code>
					)}

					<div className="flex gap-1.5">
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
				</CardContent>
			</Card>
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
			<div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
				<button
					type="button"
					onClick={onBack}
					className="p-1.5 rounded hover:bg-muted transition-colors"
					title="Back to list"
				>
					<ArrowLeft className="w-4 h-4" />
				</button>

				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span className="text-sm font-medium truncate">{env.name}</span>
					<StatusBadge platform={env.platform} />
				</div>

				<div className="flex items-center gap-1 shrink-0">
					<button
						type="button"
						onClick={refresh}
						className="p-1.5 rounded hover:bg-muted transition-colors"
						title="Refresh preview"
					>
						<RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
					</button>
					<CopyButton text={env.url ?? ""} />
					<a
						href={previewUrl}
						target="_blank"
						rel="noreferrer"
						className="p-1.5 rounded hover:bg-muted transition-colors"
						title="Open in browser"
					>
						<ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
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
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold flex items-center gap-2">
						<Server className="w-5 h-5 text-muted-foreground" />
						{environment.name}
					</h1>
					<p className="text-sm text-muted-foreground">{site}</p>
				</div>
				<StatusBadge platform={environment.platform} />
			</div>

			<div className="grid gap-3">
				{environment.upstream && (
					<div className="flex items-center gap-2 text-sm">
						<GitBranch className="w-4 h-4 text-muted-foreground" />
						<span className="text-muted-foreground">Branch:</span>
						<Badge variant="secondary">{environment.upstream}</Badge>
					</div>
				)}
				{environment.head && (
					<div className="flex items-center gap-2 text-sm">
						<Box className="w-4 h-4 text-muted-foreground" />
						<span className="text-muted-foreground">Commit:</span>
						<code className="text-xs bg-muted px-1.5 py-0.5 rounded">
							{environment.head.slice(0, 8)}
						</code>
					</div>
				)}
				{environment.createdAt && (
					<div className="text-sm text-muted-foreground">
						Created {new Date(environment.createdAt).toLocaleString()}
					</div>
				)}
			</div>

			<div className="space-y-2">
				{environment.url && (
					<UrlRow label="Environment URL" url={environment.url} />
				)}
				<UrlRow label="Preview URL" url={previewUrl} />
			</div>

			<div className="flex gap-1.5">
				{environment.public && (
					<Badge variant="outline">public</Badge>
				)}
				{environment.readonly && (
					<Badge variant="outline">read-only</Badge>
				)}
				{environment.transient && (
					<Badge variant="outline">transient</Badge>
				)}
			</div>
		</div>
	);
}

// ─── shared page shell ────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
	return <div className="p-6 min-h-dvh">{children}</div>;
}

function InitializingView() {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
				<span className="text-sm">Connecting to host...</span>
			</div>
		</div>
	);
}

function ErrorView({ error }: { error?: string }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className="w-full max-w-md border-destructive">
				<CardHeader>
					<CardTitle className="text-destructive">Error</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-destructive">{error ?? "Unknown error"}</p>
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

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md text-center">
					<CardHeader>
						<CardTitle>Environments</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary">list_environments</Badge> to see all
							environments.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Fetching environments...</span>
				</div>
			</div>
		);
	}

	const { environments, site } = state.toolResult ?? {
		environments: [],
		site: "",
	};

	const filtered = search.trim()
		? environments.filter((e) =>
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
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-lg font-semibold">Environments</h1>
						<p className="text-sm text-muted-foreground">
							{site} &middot; {environments.length} environment
							{environments.length !== 1 ? "s" : ""}
						</p>
					</div>
					<Globe className="w-5 h-5 text-muted-foreground" />
				</div>

				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						placeholder="Filter by name, URL or branch..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>

				{filtered.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
						<Plus className="w-10 h-10 opacity-40" />
						<p className="text-sm">
							{search
								? `No environments match "${search}"`
								: "No environments yet"}
						</p>
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
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

// ─── GetEnvironmentPage ───────────────────────────────────────────────────────

export function GetEnvironmentPage() {
	const state = useMcpState<GetEnvironmentInput, GetEnvironmentOutput>();

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;

	if (state.status === "connected" || state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">
						{state.status === "tool-input"
							? `Loading "${state.toolInput?.name}"...`
							: "Waiting for tool call..."}
					</span>
				</div>
			</div>
		);
	}

	const { environment, site, previewUrl } = state.toolResult ?? {
		environment: { name: "", url: "" },
		site: "",
		previewUrl: "",
	};

	return (
		<PageShell>
			<EnvironmentDetail
				environment={environment}
				previewUrl={previewUrl}
				site={site}
			/>
		</PageShell>
	);
}

// ─── CreateEnvironmentPage ────────────────────────────────────────────────────

export function CreateEnvironmentPage() {
	const state = useMcpState<CreateEnvironmentInput, CreateEnvironmentOutput>();

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;

	if (state.status === "connected" || state.status === "tool-input") {
		const name = state.toolInput?.name;
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
							Creating environment
							{name ? ` "${name}"` : ""}…
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Provisioning Kubernetes deployment. This may take 1–3 minutes.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const { environment, site, previewUrl, message } = state.toolResult ?? {
		environment: { name: "", url: "" },
		site: "",
		previewUrl: "",
		message: "",
	};

	return (
		<PageShell>
			<div className="space-y-4">
				<div className="flex items-center gap-2 text-green-600 font-medium">
					<Check className="w-5 h-5" />
					Environment created
				</div>
				{message && (
					<p className="text-sm text-muted-foreground">{message}</p>
				)}
				<EnvironmentDetail
					environment={environment}
					previewUrl={previewUrl}
					site={site}
				/>
			</div>
		</PageShell>
	);
}

// ─── PreviewEnvironmentPage ───────────────────────────────────────────────────

export function PreviewEnvironmentPage() {
	const state = useMcpState<PreviewEnvironmentInput, PreviewEnvironmentOutput>();

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;

	if (state.status === "connected" || state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">
						{state.toolInput
							? `Building preview for "${state.toolInput.name}"${state.toolInput.path !== "/" ? ` → ${state.toolInput.path}` : ""}...`
							: "Waiting for tool call..."}
					</span>
				</div>
			</div>
		);
	}

	const { previewUrl, environment, site, path } = state.toolResult ?? {
		previewUrl: "",
		environment: { name: "", url: "" },
		site: "",
		path: "/",
	};

	return (
		<iframe
            src={previewUrl}
            title={`Preview of ${environment.name}`}
            className="w-full border-0"
            style={{ height: "calc(100dvh)", minHeight: "520px" }}
        />
	);
}
