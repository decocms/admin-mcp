import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import {
	AlertTriangle,
	Check,
	Copy,
	Download,
	File,
	FileText,
	Film,
	Image,
	Music,
	Package,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type {
	Asset,
	AssetsInput,
	AssetsOutput,
	DeleteConfig,
	UploadConfig,
} from "../../../api/tools/assets.ts";

// ─── helpers ────────────────────────────────────────────────────────────────

function getMimeIcon(mime: string | null) {
	if (!mime) return <File className="w-8 h-8 text-muted-foreground" />;
	if (mime.startsWith("image/"))
		return <Image className="w-8 h-8 text-blue-500" />;
	if (mime.startsWith("video/"))
		return <Film className="w-8 h-8 text-purple-500" />;
	if (mime.startsWith("audio/"))
		return <Music className="w-8 h-8 text-green-500" />;
	if (mime === "application/pdf")
		return <FileText className="w-8 h-8 text-red-500" />;
	if (mime.startsWith("font/") || mime.includes("font"))
		return <Package className="w-8 h-8 text-yellow-500" />;
	return <File className="w-8 h-8 text-muted-foreground" />;
}

function filenameFromPath(path: string) {
	return path.split("/").pop() ?? path;
}

// ─── upload helpers ──────────────────────────────────────────────────────────

interface UploadItem {
	id: string;
	file: File;
	status: "pending" | "uploading" | "done" | "error";
	error?: string;
	result?: Asset;
}

async function uploadFile(
	file: File,
	config: UploadConfig,
): Promise<Asset> {
	const form = new FormData();
	form.append("sitename", config.sitename);
	form.append("file", file, file.name);

	const res = await fetch(config.endpoint, {
		method: "POST",
		headers: { "x-api-key": config.apiKey },
		body: form,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(text || `Upload failed (${res.status})`);
	}

	return res.json();
}

async function deleteAsset(
	id: number,
	config: DeleteConfig,
): Promise<void> {
	const res = await fetch(config.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": config.apiKey,
		},
		body: JSON.stringify({ sitename: config.sitename, id: String(id) }),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(text || `Delete failed (${res.status})`);
	}
}

// ─── AssetCard ───────────────────────────────────────────────────────────────

function AssetCard({
	asset,
	deleteConfig,
	onDeleted,
}: {
	asset: Asset;
	deleteConfig: DeleteConfig;
	onDeleted: (id: number) => void;
}) {
	const [copied, setCopied] = useState(false);
	const [deleteState, setDeleteState] = useState<
		"idle" | "confirm" | "deleting" | "error"
	>("idle");
	const [deleteError, setDeleteError] = useState<string>();

	const isImage = asset.mime?.startsWith("image/") ?? false;
	const name = asset.label ?? filenameFromPath(asset.path);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(asset.publicUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

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
			await deleteAsset(asset.id, deleteConfig);
			onDeleted(asset.id);
		} catch (err) {
			setDeleteError(
				err instanceof Error ? err.message : "Delete failed",
			);
			setDeleteState("error");
		}
	};

	return (
		<div className="group relative flex flex-col rounded-lg border bg-card overflow-hidden hover:border-primary/50 transition-colors">
			<div className="relative aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
				{isImage ? (
					<img
						src={asset.publicUrl}
						alt={name}
						className="w-full h-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="flex flex-col items-center gap-2 p-4">
						{getMimeIcon(asset.mime)}
						{asset.mime && (
							<span className="text-xs text-muted-foreground font-mono">
								{asset.mime.split("/")[1]?.toUpperCase() ?? asset.mime}
							</span>
						)}
					</div>
				)}

				{/* Hover overlay — normal actions */}
				{deleteState === "idle" && (
					<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
						<Button
							size="icon"
							variant="secondary"
							className="w-8 h-8"
							onClick={handleCopy}
							title="Copy URL"
						>
							{copied ? (
								<Check className="w-4 h-4 text-green-500" />
							) : (
								<Copy className="w-4 h-4" />
							)}
						</Button>
						<a
							href={asset.publicUrl}
							download
							target="_blank"
							rel="noreferrer"
						>
							<Button
								size="icon"
								variant="secondary"
								className="w-8 h-8"
								title="Download"
							>
								<Download className="w-4 h-4" />
							</Button>
						</a>
						<Button
							size="icon"
							variant="secondary"
							className="w-8 h-8 hover:bg-destructive hover:text-destructive-foreground"
							onClick={handleDeleteClick}
							title="Delete"
						>
							<Trash2 className="w-4 h-4" />
						</Button>
					</div>
				)}

				{/* Confirm delete overlay */}
				{(deleteState === "confirm" ||
					deleteState === "deleting" ||
					deleteState === "error") && (
					<div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2">
						{deleteState === "error" ? (
							<>
								<AlertTriangle className="w-5 h-5 text-destructive" />
								<p className="text-xs text-destructive text-center line-clamp-2">
									{deleteError}
								</p>
								<Button
									size="sm"
									variant="secondary"
									className="h-6 text-xs px-2"
									onClick={handleDeleteCancel}
								>
									Close
								</Button>
							</>
						) : deleteState === "deleting" ? (
							<span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
						) : (
							<>
								<p className="text-xs text-white font-medium text-center">
									Delete?
								</p>
								<div className="flex gap-1.5">
									<Button
										size="sm"
										variant="destructive"
										className="h-6 text-xs px-2"
										onClick={handleDeleteConfirm}
									>
										Delete
									</Button>
									<Button
										size="sm"
										variant="secondary"
										className="h-6 text-xs px-2"
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
			<div className="p-2 flex flex-col gap-1 min-w-0">
				<p
					className="text-xs font-medium truncate text-foreground"
					title={name}
				>
					{name}
				</p>
				{asset.mime && (
					<Badge
						variant="secondary"
						className="text-xs px-1 py-0 h-4 font-mono w-fit"
					>
						{asset.mime.split("/")[1] ?? asset.mime}
					</Badge>
				)}
			</div>
		</div>
	);
}

// ─── UploadQueue ─────────────────────────────────────────────────────────────

function UploadQueue({
	items,
	onDismiss,
}: {
	items: UploadItem[];
	onDismiss: (id: string) => void;
}) {
	if (items.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5">
			{items.map((item) => (
				<div
					key={item.id}
					className={cn(
						"flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
						item.status === "error" && "border-destructive/50 bg-destructive/5",
						item.status === "done" && "border-green-500/30 bg-green-500/5",
						(item.status === "uploading" || item.status === "pending") &&
							"bg-muted/50",
					)}
				>
					{item.status === "uploading" && (
						<span className="w-3.5 h-3.5 shrink-0 border-2 border-muted border-t-primary rounded-full animate-spin" />
					)}
					{item.status === "done" && (
						<Check className="w-3.5 h-3.5 shrink-0 text-green-500" />
					)}
					{item.status === "error" && (
						<X className="w-3.5 h-3.5 shrink-0 text-destructive" />
					)}
					{item.status === "pending" && (
						<span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-muted" />
					)}
					<span className="truncate flex-1 text-xs">
						{item.file.name}
					</span>
					{item.status === "error" && item.error && (
						<span className="text-xs text-destructive truncate max-w-[120px]">
							{item.error}
						</span>
					)}
					{(item.status === "done" || item.status === "error") && (
						<button
							type="button"
							onClick={() => onDismiss(item.id)}
							className="shrink-0 text-muted-foreground hover:text-foreground"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</div>
			))}
		</div>
	);
}

// ─── AssetsGallery ────────────────────────────────────────────────────────────

function AssetsGallery({
	initialAssets,
	sitename,
	uploadConfig,
	deleteConfig,
}: {
	initialAssets: Asset[];
	sitename: string;
	uploadConfig: UploadConfig;
	deleteConfig: DeleteConfig;
}) {
	const [assets, setAssets] = useState<Asset[]>(initialAssets);
	const [search, setSearch] = useState("");
	const [queue, setQueue] = useState<UploadItem[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const filtered = search.trim()
		? assets.filter((a) => {
				const label = (a.label ?? filenameFromPath(a.path)).toLowerCase();
				return label.includes(search.toLowerCase());
			})
		: assets;

	const processFiles = useCallback(
		async (files: File[]) => {
			if (files.length === 0) return;

			const newItems: UploadItem[] = files.map((f) => ({
				id: crypto.randomUUID(),
				file: f,
				status: "pending",
			}));

			setQueue((prev) => [...prev, ...newItems]);

			for (const item of newItems) {
				setQueue((prev) =>
					prev.map((q) =>
						q.id === item.id ? { ...q, status: "uploading" } : q,
					),
				);
				try {
					const result = await uploadFile(item.file, uploadConfig);
					setQueue((prev) =>
						prev.map((q) =>
							q.id === item.id ? { ...q, status: "done", result } : q,
						),
					);
					setAssets((prev) => [result, ...prev]);
				} catch (err) {
					const msg =
						err instanceof Error ? err.message : "Unknown error";
					setQueue((prev) =>
						prev.map((q) =>
							q.id === item.id ? { ...q, status: "error", error: msg } : q,
						),
					);
				}
			}
		},
		[uploadConfig],
	);

	const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files ?? []);
		processFiles(files);
		e.target.value = "";
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		const files = Array.from(e.dataTransfer.files);
		processFiles(files);
	};

	const dismissQueueItem = (id: string) => {
		setQueue((prev) => prev.filter((q) => q.id !== id));
	};

	const handleAssetDeleted = (id: number) => {
		setAssets((prev) => prev.filter((a) => a.id !== id));
	};

	return (
		<div
			className={cn(
				"flex flex-col gap-4 min-h-dvh transition-colors",
				isDragging && "bg-primary/5",
			)}
			onDragOver={(e) => {
				e.preventDefault();
				setIsDragging(true);
			}}
			onDragLeave={() => setIsDragging(false)}
			onDrop={handleDrop}
		>
			{/* Header */}
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-lg font-semibold">Assets</h1>
					<p className="text-sm text-muted-foreground">
						{sitename} &middot; {assets.length} file
						{assets.length !== 1 ? "s" : ""}
					</p>
				</div>
				<Button
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					className="gap-2 shrink-0"
				>
					<Upload className="w-4 h-4" />
					Upload
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={handleFileInput}
				/>
			</div>

			{/* Upload queue */}
			<UploadQueue items={queue} onDismiss={dismissQueueItem} />

			{/* Search */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					placeholder="Filter assets..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			{/* Drop overlay hint */}
			{isDragging && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
					<div className="flex flex-col items-center gap-3 text-primary">
						<Upload className="w-10 h-10" />
						<p className="text-lg font-semibold">Drop files to upload</p>
					</div>
				</div>
			)}

			{/* Grid */}
			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
					<Image className="w-10 h-10 opacity-40" />
					<p className="text-sm">
						{search
							? `No assets found for "${search}"`
							: "No assets yet — upload some files to get started"}
					</p>
					{!search && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
							className="gap-2 mt-1"
						>
							<Upload className="w-4 h-4" />
							Upload files
						</Button>
					)}
				</div>
			) : (
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
					{filtered.map((asset) => (
						<AssetCard
							key={asset.id}
							asset={asset}
							deleteConfig={deleteConfig}
							onDeleted={handleAssetDeleted}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingGrid() {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
			{Array.from({ length: 10 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static loading skeleton
				<div key={i} className="flex flex-col gap-2">
					<Skeleton className="aspect-square rounded-lg" />
					<Skeleton className="h-3 w-3/4 rounded" />
					<Skeleton className="h-3 w-1/2 rounded" />
				</div>
			))}
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
	const state = useMcpState<AssetsInput, AssetsOutput>();

	if (state.status === "initializing") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Connecting to host...</span>
				</div>
			</div>
		);
	}

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md text-center">
					<CardHeader>
						<CardTitle>Assets</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Connected. Call the{" "}
							<Badge variant="secondary">fetch_assets</Badge> tool with a site
							name to browse assets.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Error</CardTitle>
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
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Cancelled</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-destructive">Tool call was cancelled.</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return (
			<div className="flex flex-col gap-4 p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Fetching assets...</span>
				</div>
				<LoadingGrid />
			</div>
		);
	}

	// tool-result
	const { assets, sitename, uploadConfig, deleteConfig } =
		state.toolResult ?? {
			assets: [],
			sitename: "",
			uploadConfig: { endpoint: "", apiKey: "", sitename: "" },
			deleteConfig: { endpoint: "", apiKey: "", sitename: "" },
		};

	return (
		<div className="p-6">
			<AssetsGallery
				initialAssets={assets}
				sitename={sitename}
				uploadConfig={uploadConfig}
				deleteConfig={deleteConfig}
			/>
		</div>
	);
}
