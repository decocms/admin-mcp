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
import { useMcpApp, useMcpState } from "@/context.tsx";
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

const PAGE_SIZE = 21;
import type {
	Asset,
	AssetsInput,
	AssetsOutput,
} from "../../../api/tools/assets.ts";
import type { UploadAssetOutput } from "../../../api/tools/upload-asset.ts";

// ─── helpers ────────────────────────────────────────────────────────────────

function getMimeIcon(mime: string | null) {
	const base = "w-7 h-7";
	if (!mime) return <File className={cn(base, "text-muted-foreground")} />;
	if (mime.startsWith("image/"))
		return <Image className={cn(base, "text-chart-1")} />;
	if (mime.startsWith("video/"))
		return <Film className={cn(base, "text-chart-4")} />;
	if (mime.startsWith("audio/"))
		return <Music className={cn(base, "text-chart-2")} />;
	if (mime === "application/pdf")
		return <FileText className={cn(base, "text-chart-3")} />;
	if (mime.startsWith("font/") || mime.includes("font"))
		return <Package className={cn(base, "text-warning")} />;
	return <File className={cn(base, "text-muted-foreground")} />;
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

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.split(",")[1]);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

// ─── AssetCard ───────────────────────────────────────────────────────────────

function AssetCard({
	asset,
	onDelete,
	onDeleted,
}: {
	asset: Asset;
	onDelete: (id: number) => Promise<void>;
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
			await onDelete(asset.id);
			onDeleted(asset.id);
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : "Delete failed");
			setDeleteState("error");
		}
	};

	return (
		<div className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm">
			{/* Preview area */}
			<div
				className="relative aspect-square flex items-center justify-center overflow-hidden"
				style={{
					backgroundImage: `
						linear-gradient(45deg, var(--color-muted) 25%, transparent 25%),
						linear-gradient(-45deg, var(--color-muted) 25%, transparent 25%),
						linear-gradient(45deg, transparent 75%, var(--color-muted) 75%),
						linear-gradient(-45deg, transparent 75%, var(--color-muted) 75%)
					`,
					backgroundSize: "12px 12px",
					backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
					backgroundColor: "var(--color-background)",
				}}
			>
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
					<div className="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
						<Button
							size="icon"
							variant="secondary"
							className="w-7 h-7"
							onClick={handleCopy}
							title="Copy URL"
						>
							{copied ? (
								<Check className="w-3.5 h-3.5 text-success" />
							) : (
								<Copy className="w-3.5 h-3.5" />
							)}
						</Button>
						<a href={asset.publicUrl} download target="_blank" rel="noreferrer">
							<Button
								size="icon"
								variant="secondary"
								className="w-7 h-7"
								title="Download"
							>
								<Download className="w-3.5 h-3.5" />
							</Button>
						</a>
						<Button
							size="icon"
							variant="secondary"
							className="w-7 h-7 hover:bg-destructive hover:text-destructive-foreground"
							onClick={handleDeleteClick}
							title="Delete"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</Button>
					</div>
				)}

				{/* Confirm delete overlay */}
				{(deleteState === "confirm" ||
					deleteState === "deleting" ||
					deleteState === "error") && (
					<div className="absolute inset-0 bg-foreground/65 flex flex-col items-center justify-center gap-2 p-2">
						{deleteState === "error" ? (
							<>
								<AlertTriangle className="w-4 h-4 text-destructive-foreground" />
								<p className="text-xs text-destructive-foreground text-center line-clamp-2">
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

			{/* Name */}
			<div className="px-2 py-1.5">
				<p
					className="text-xs font-medium truncate text-foreground leading-tight"
					title={name}
				>
					{name}
				</p>
				{asset.mime && (
					<p className="text-xs text-muted-foreground/70 font-mono truncate mt-0.5">
						{asset.mime.split("/")[1]?.toUpperCase() ?? asset.mime}
					</p>
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
		<div className="flex flex-col gap-1">
			{items.map((item) => (
				<div
					key={item.id}
					className={cn(
						"flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
						item.status === "error" && "border-destructive/40 bg-destructive/5",
						item.status === "done" && "border-success/30 bg-success/5",
						(item.status === "uploading" || item.status === "pending") &&
							"border-border bg-muted/30",
					)}
				>
					{item.status === "uploading" && (
						<span className="w-3.5 h-3.5 shrink-0 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
					)}
					{item.status === "done" && (
						<Check className="w-3.5 h-3.5 shrink-0 text-success" />
					)}
					{item.status === "error" && (
						<X className="w-3.5 h-3.5 shrink-0 text-destructive" />
					)}
					{item.status === "pending" && (
						<span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-muted" />
					)}
					<span className="truncate flex-1 text-xs">{item.file.name}</span>
					{item.status === "error" && item.error && (
						<span className="text-xs text-destructive truncate max-w-[120px]">
							{item.error}
						</span>
					)}
					{(item.status === "done" || item.status === "error") && (
						<button
							type="button"
							onClick={() => onDismiss(item.id)}
							className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
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
}: {
	initialAssets: Asset[];
	sitename: string;
}) {
	const app = useMcpApp();
	const [assets, setAssets] = useState<Asset[]>(initialAssets);
	const [search, setSearch] = useState("");
	const [hasMore, setHasMore] = useState(initialAssets.length >= PAGE_SIZE);
	const [isFetchingMore, setIsFetchingMore] = useState(false);
	const [fetchMoreError, setFetchMoreError] = useState<string>();
	const [queue, setQueue] = useState<UploadItem[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const filtered = search.trim()
		? assets.filter((a) => {
				const label = (a.label ?? filenameFromPath(a.path)).toLowerCase();
				return label.includes(search.toLowerCase());
			})
		: assets;

	const handleShowMore = useCallback(async () => {
		setIsFetchingMore(true);
		setFetchMoreError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "fetch_assets",
				arguments: { offset: assets.length, limit: PAGE_SIZE },
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to load more assets",
				);
			}
			const data = result?.structuredContent as AssetsOutput | undefined;
			const newAssets = data?.assets ?? [];
			setAssets((prev) => [...prev, ...newAssets]);
			if (newAssets.length < PAGE_SIZE) setHasMore(false);
		} catch (err) {
			setFetchMoreError(
				err instanceof Error ? err.message : "Failed to load more",
			);
		} finally {
			setIsFetchingMore(false);
		}
	}, [app, assets.length]);

	const handleDelete = useCallback(
		async (id: number) => {
			const result = await app?.callServerTool({
				name: "delete_asset",
				arguments: { id: String(id) },
			});
			if (result?.isError) {
				const text = result.content?.find((c) => c.type === "text");
				throw new Error(text?.type === "text" ? text.text : "Delete failed");
			}
		},
		[app],
	);

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
					const base64 = await fileToBase64(item.file);
					const result = await app?.callServerTool({
						name: "upload_asset",
						arguments: {
							data: base64,
							mimeType: item.file.type || "application/octet-stream",
							filename: item.file.name,
						},
					});
					if (result?.isError) {
						const text = result.content?.find((c) => c.type === "text");
						throw new Error(
							text?.type === "text" ? text.text : "Upload failed",
						);
					}
					const uploaded = result?.structuredContent as
						| UploadAssetOutput
						| undefined;
					const uploadedAsset = uploaded?.asset;
					setQueue((prev) =>
						prev.map((q) =>
							q.id === item.id
								? { ...q, status: "done", result: uploadedAsset }
								: q,
						),
					);
					if (uploadedAsset) {
						setAssets((prev) => [uploadedAsset, ...prev]);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : "Unknown error";
					setQueue((prev) =>
						prev.map((q) =>
							q.id === item.id ? { ...q, status: "error", error: msg } : q,
						),
					);
				}
			}
		},
		[app],
	);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearch(e.target.value);
	};

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
				"flex flex-col gap-4 min-h-dvh transition-colors duration-200",
				isDragging && "bg-primary/4",
			)}
			onDragOver={(e) => {
				e.preventDefault();
				setIsDragging(true);
			}}
			onDragLeave={() => setIsDragging(false)}
			onDrop={handleDrop}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="text-base font-semibold">Assets</h1>
					{sitename && (
						<p className="text-sm text-muted-foreground mt-0.5">{sitename}</p>
					)}
				</div>
				<Button
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					className="gap-1.5 shrink-0 h-8"
				>
					<Upload className="w-3.5 h-3.5" />
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
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
				<Input
					placeholder="Filter assets…"
					value={search}
					onChange={handleSearchChange}
					className="pl-9 h-8 text-sm"
				/>
			</div>

			{/* Drop overlay hint */}
			{isDragging && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
					<div className="flex flex-col items-center gap-3 text-primary">
						<Upload className="w-10 h-10" />
						<p className="text-base font-semibold">Drop files to upload</p>
					</div>
				</div>
			)}

			{/* Grid */}
			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
					<Image className="w-8 h-8 opacity-30" />
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
							className="gap-1.5 mt-1 h-8"
						>
							<Upload className="w-3.5 h-3.5" />
							Upload files
						</Button>
					)}
				</div>
			) : (
				<>
					<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
						{filtered.map((asset) => (
							<AssetCard
								key={asset.id}
								asset={asset}
								onDelete={handleDelete}
								onDeleted={handleAssetDeleted}
							/>
						))}
					</div>
					{hasMore && (
						<div className="flex flex-col items-center gap-2 pt-2 pb-6">
							<Button
								variant="outline"
								size="sm"
								onClick={handleShowMore}
								disabled={isFetchingMore}
								className="gap-2 h-8"
							>
								{isFetchingMore && (
									<span className="w-3.5 h-3.5 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
								)}
								{isFetchingMore ? "Loading…" : "Show more"}
							</Button>
							{fetchMoreError && (
								<p className="text-xs text-destructive">{fetchMoreError}</p>
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingGrid() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
				<span className="text-sm">Fetching assets…</span>
			</div>
			<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
				{Array.from({ length: 12 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static loading skeleton
					<div key={i} className="flex flex-col gap-1.5">
						<Skeleton className="aspect-square rounded-lg" />
						<Skeleton className="h-2.5 w-4/5 rounded" />
						<Skeleton className="h-2.5 w-2/5 rounded" />
					</div>
				))}
			</div>
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
					<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
					<span className="text-sm">Connecting to host…</span>
				</div>
			</div>
		);
	}

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">Assets</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Call the{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								fetch_assets
							</Badge>{" "}
							tool with a site name to browse assets.
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
				<Card className="w-full max-w-sm">
					<CardContent className="pt-6">
						<p className="text-sm text-muted-foreground text-center">
							Tool call was cancelled.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-input") {
		return (
			<div className="p-5">
				<LoadingGrid />
			</div>
		);
	}

	// tool-result
	const { assets, sitename } = state.toolResult ?? { assets: [], sitename: "" };

	return (
		<div className="p-5">
			<AssetsGallery initialAssets={assets} sitename={sitename} />
		</div>
	);
}
