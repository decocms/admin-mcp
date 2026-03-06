import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import {
	Check,
	Copy,
	Download,
	ExternalLink,
	File,
	FileText,
	Film,
	Image,
	Music,
	Package,
	Upload,
} from "lucide-react";
import { useState } from "react";
import type {
	UploadAssetInput,
	UploadAssetOutput,
} from "../../../api/tools/upload-asset.ts";

function getMimeIcon(mime: string | null) {
	if (!mime) return <File className="w-12 h-12 text-muted-foreground" />;
	if (mime.startsWith("image/"))
		return <Image className="w-12 h-12 text-blue-500" />;
	if (mime.startsWith("video/"))
		return <Film className="w-12 h-12 text-purple-500" />;
	if (mime.startsWith("audio/"))
		return <Music className="w-12 h-12 text-green-500" />;
	if (mime === "application/pdf")
		return <FileText className="w-12 h-12 text-red-500" />;
	if (mime.startsWith("font/") || mime.includes("font"))
		return <Package className="w-12 h-12 text-yellow-500" />;
	return <File className="w-12 h-12 text-muted-foreground" />;
}

export default function UploadAssetPage() {
	const state = useMcpState<UploadAssetInput, UploadAssetOutput>();
	const [copied, setCopied] = useState(false);

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
						<CardTitle>Upload Asset</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Connected. Call the{" "}
							<Badge variant="secondary">upload_asset</Badge> tool with a file
							URL to upload it to the site's asset library.
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
						<CardTitle className="text-destructive">Upload failed</CardTitle>
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
		const { url, filename } = state.toolInput ?? {};
		const name = filename ?? url?.split("/").pop() ?? "file";

		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
							Uploading…
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-sm text-muted-foreground font-medium truncate">
							{name}
						</p>
						{url && (
							<p className="text-xs text-muted-foreground truncate">{url}</p>
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	// tool-result
	const { asset, message } = state.toolResult ?? { asset: null, message: "" };

	if (!asset) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Upload failed</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-destructive">{message}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const isImage = asset.mime?.startsWith("image/") ?? false;
	const name = asset.label ?? asset.path.split("/").pop() ?? "asset";

	const handleCopy = async () => {
		await navigator.clipboard.writeText(asset.publicUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-green-600">
						<Upload className="w-5 h-5" />
						Uploaded successfully
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Preview */}
					<div className="rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center aspect-video">
						{isImage ? (
							<img
								src={asset.publicUrl}
								alt={name}
								className="w-full h-full object-contain"
							/>
						) : (
							<div className="flex flex-col items-center gap-2 p-6">
								{getMimeIcon(asset.mime)}
								{asset.mime && (
									<span className="text-xs text-muted-foreground font-mono">
										{asset.mime}
									</span>
								)}
							</div>
						)}
					</div>

					{/* Info */}
					<div className="space-y-1">
						<p className="font-medium text-sm truncate">{name}</p>
						{asset.mime && (
							<Badge variant="secondary" className="font-mono text-xs">
								{asset.mime}
							</Badge>
						)}
					</div>

					{/* URL */}
					<div className="flex items-center gap-2">
						<code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">
							{asset.publicUrl}
						</code>
						<button
							type="button"
							onClick={handleCopy}
							className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
							title="Copy URL"
						>
							{copied ? (
								<Check className="w-4 h-4 text-green-500" />
							) : (
								<Copy className="w-4 h-4 text-muted-foreground" />
							)}
						</button>
						<a
							href={asset.publicUrl}
							download
							target="_blank"
							rel="noreferrer"
							className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
							title="Download"
						>
							<Download className="w-4 h-4 text-muted-foreground" />
						</a>
						<a
							href={asset.publicUrl}
							target="_blank"
							rel="noreferrer"
							className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
							title="Open in new tab"
						>
							<ExternalLink className="w-4 h-4 text-muted-foreground" />
						</a>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
