import type { OnMount } from "@monaco-editor/react";
import Editor, { loader } from "@monaco-editor/react";
import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	Eye,
	File,
	FileCode2,
	Folder,
	FolderOpen,
	LayoutTemplate,
	Loader2,
	Monitor,
	MousePointer2,
	RefreshCw,
	Save,
	Search,
	Smartphone,
	Trash2,
	X,
} from "lucide-react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker&inline";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker&inline";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker&inline";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker&inline";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline";
import {
	type ComponentProps,
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	PreviewEnvironmentInput,
	PreviewEnvironmentOutput,
} from "../../../api/tools/environments.ts";
import type {
	FileExplorerInput,
	FileExplorerOutput,
	GetPagesOutput,
	ListFilesOutput,
	PageInfo,
	ReadFileOutput,
	WriteFileOutput,
} from "../../../api/tools/files.ts";
import type { GitStatus } from "../../../api/tools/git.ts";
import { PublishDialog } from "./publish-dialog.tsx";
import type {
	EnvStatus,
	FileBuffer,
	PreviewViewport,
	ViewMode,
	VisualEditorPayload,
} from "./types.ts";
import {
	buildFileTree,
	flattenTree,
	getAncestorDirectories,
	getBasename,
	getLanguageFromPath,
	normalizePath,
} from "./utils.ts";

// ─── monaco setup ─────────────────────────────────────────────────────────────

loader.config({ monaco });

globalThis.MonacoEnvironment = {
	getWorker(_workerId, label) {
		if (label === "json") return new jsonWorker();
		if (label === "css" || label === "scss" || label === "less")
			return new cssWorker();
		if (label === "html" || label === "handlebars" || label === "razor")
			return new htmlWorker();
		if (label === "typescript" || label === "javascript") return new tsWorker();
		return new editorWorker();
	},
};

// ─── constants ────────────────────────────────────────────────────────────────

const WARMUP_TOAST_ID = "env-warmup";
const WARMUP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 5000;

// ─── small view components ────────────────────────────────────────────────────

function Spinner({ label }: { label: string }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
				<span className="text-sm">{label}</span>
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

function PreviewErrorFallback() {
	return (
		<div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-background p-6">
			<Card className="w-full max-w-lg border-muted bg-muted/30">
				<CardHeader className="pb-1">
					<CardTitle className="text-base text-foreground/80">
						Preview not available for this Stack
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-0">
					<p className="text-sm text-muted-foreground">
						It is normal for some repositories to not have a preview URL or live
						application route available.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

// ─── visual editor script ─────────────────────────────────────────────────────

function visualEditorScript() {
	if ((window as unknown as Record<string, unknown>).__visualEditorActive)
		return;
	(window as unknown as Record<string, unknown>).__visualEditorActive = true;

	const cursorStyle = document.createElement("style");
	cursorStyle.textContent = "* { cursor: default !important; }";
	document.head.appendChild(cursorStyle);

	const highlight = document.createElement("div");
	highlight.style.cssText =
		"position:fixed;pointer-events:none;outline:2px solid #6366f1;background:rgba(99,102,241,0.08);border-radius:2px;z-index:2147483647;display:none;transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;";
	document.body.appendChild(highlight);

	const badge = document.createElement("div");
	badge.style.cssText =
		"position:fixed;pointer-events:none;background:#6366f1;color:white;font:11px/1 monospace;padding:2px 6px;border-radius:2px;z-index:2147483647;display:none;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;";
	document.body.appendChild(badge);

	document.addEventListener(
		"mouseover",
		(e) => {
			const el = e.target as HTMLElement;
			if (!el || el === highlight || el === badge) return;
			const r = el.getBoundingClientRect();
			highlight.style.display = "block";
			highlight.style.top = `${r.top}px`;
			highlight.style.left = `${r.left}px`;
			highlight.style.width = `${r.width}px`;
			highlight.style.height = `${r.height}px`;
			const tag = el.tagName.toLowerCase();
			const id = el.id ? `#${el.id}` : "";
			const cls =
				el.className && typeof el.className === "string"
					? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
					: "";
			badge.textContent = tag + id + cls;
			badge.style.display = "block";
			badge.style.top = `${Math.max(0, r.top - 20)}px`;
			badge.style.left = `${r.left}px`;
		},
		true,
	);

	document.addEventListener(
		"mouseout",
		() => {
			highlight.style.display = "none";
			badge.style.display = "none";
		},
		true,
	);

	document.addEventListener(
		"click",
		(e) => {
			e.preventDefault();
			e.stopImmediatePropagation();
			const el = e.target as HTMLElement;
			if (!el || el === highlight || el === badge) return;

			highlight.style.outline = "2px solid #a855f7";
			highlight.style.background = "rgba(168,85,247,0.15)";
			setTimeout(() => {
				highlight.style.outline = "2px solid #6366f1";
				highlight.style.background = "rgba(99,102,241,0.08)";
			}, 400);

			const tag = el.tagName.toLowerCase();
			const id = el.id || "";
			const classes =
				el.className && typeof el.className === "string"
					? el.className.trim()
					: "";
			const text = (el.textContent || "").trim().slice(0, 200);
			const html = (el.outerHTML || "").slice(0, 800);

			const closestSection = el.closest(
				"section[data-manifest-key]",
			) as HTMLElement | null;
			const manifestKey =
				closestSection?.getAttribute("data-manifest-key") ?? null;

			let ancestor: HTMLElement | null = el;
			let componentName: string | null = null;
			for (let i = 0; i < 10 && ancestor; i++) {
				const ds = (ancestor as HTMLElement).dataset;
				if (ds) componentName = ds.componentName || componentName;
				ancestor = ancestor.parentElement;
			}

			const parents: string[] = [];
			let p: HTMLElement | null = el.parentElement;
			for (let i = 0; i < 4 && p && p !== document.body; i++) {
				const pTag = p.tagName ? p.tagName.toLowerCase() : "";
				const pId = p.id ? `#${p.id}` : "";
				const pCls =
					p.className && typeof p.className === "string"
						? `.${p.className.trim().split(/\s+/)[0]}`
						: "";
				parents.unshift(pTag + pId + pCls);
				p = p.parentElement;
			}

			window.parent.postMessage(
				{
					type: "visual-editor::element-clicked",
					payload: {
						tag,
						id,
						classes,
						text,
						html,
						manifestKey,
						componentName,
						parents: parents.join(" > "),
						url: window.location.href,
						path: window.location.pathname,
						viewport: { width: window.innerWidth, height: window.innerHeight },
						position: { x: Math.round(e.clientX), y: Math.round(e.clientY) },
					},
				},
				"*",
			);
		},
		true,
	);
}

type CodeSelectionPrompt = {
	filepath: string;
	startLine: number;
	endLine: number;
	selectedText: string;
	position: {
		left: number;
		top: number;
	};
};

// ─── main workspace ───────────────────────────────────────────────────────────

function FileExplorerWorkspace({
	site,
	userEnv,
	userEnvUrl,
	isPreviewSupported,
}: {
	site: string;
	userEnv: string;
	userEnvUrl: string | null;
	isPreviewSupported: boolean;
}) {
	const app = useMcpApp();

	// ── file/env state ──────────────────────────────────────────────────────────
	const [envStatus, setEnvStatus] = useState<EnvStatus>("warming-up");
	const [files, setFiles] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	const [openFiles, setOpenFiles] = useState<string[]>([]);
	const [fileBuffers, setFileBuffers] = useState<Record<string, FileBuffer>>(
		{},
	);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
		() => new Set(["/"]),
	);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isLoadingFile, setIsLoadingFile] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [listError, setListError] = useState<string>();
	const [fileError, setFileError] = useState<string>();

	// ── create file dialog state ────────────────────────────────────────────────
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [newFilePath, setNewFilePath] = useState("");
	const [createError, setCreateError] = useState<string>();
	const [isCreating, setIsCreating] = useState(false);

	// ── pages / url bar state ───────────────────────────────────────────────────
	const [pages, setPages] = useState<PageInfo[]>([]);
	const [pagesLoaded, setPagesLoaded] = useState(false);
	const [pagesLoading, setPagesLoading] = useState(false);
	const [pagesOpen, setPagesOpen] = useState(false);

	// ── publish ─────────────────────────────────────────────────────────────────
	const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
	const [publishDialogOpen, setPublishDialogOpen] = useState(false);

	// ── editor / preview state ──────────────────────────────────────────────────
	const [visualEditorElement, setVisualEditorElement] =
		useState<VisualEditorPayload | null>(null);
	const [visualEditorInput, setVisualEditorInput] = useState("");
	const [codePromptSelection, setCodePromptSelection] =
		useState<CodeSelectionPrompt | null>(null);
	const [codePromptInput, setCodePromptInput] = useState("");
	const [isSendingVisual, setIsSendingVisual] = useState(false);
	const [isSendingCodePrompt, setIsSendingCodePrompt] = useState(false);
	const [editorTheme, setEditorTheme] = useState<"vs" | "vs-dark">(() =>
		typeof document !== "undefined" &&
		document.documentElement.classList.contains("dark")
			? "vs-dark"
			: "vs",
	);
	const [viewMode, setViewMode] = useState<ViewMode>(
		isPreviewSupported ? "preview" : "code",
	);
	const [previewViewport, setPreviewViewport] =
		useState<PreviewViewport>("desktop");
	const [previewPathInput, setPreviewPathInput] = useState("/");
	const [previewPath, setPreviewPath] = useState("/");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string>();
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

	// ── refs ────────────────────────────────────────────────────────────────────
	const selectedFileRef = useRef<string | null>(null);
	const saveActiveFileRef = useRef<(() => Promise<void>) | null>(null);
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
	const pagesContainerRef = useRef<HTMLDivElement>(null);
	const previewIframeRef = useRef<HTMLIFrameElement>(null);
	const visualEditorInputRef = useRef<HTMLInputElement>(null);
	const codePromptInputRef = useRef<HTMLInputElement>(null);

	// ── computed ────────────────────────────────────────────────────────────────
	const isReadonly = false;
	const envUrl = userEnvUrl;

	const currentFileBuffer = selectedFile
		? fileBuffers[selectedFile]
		: undefined;

	const isPathDirty = useCallback(
		(filepath: string) => {
			const buf = fileBuffers[filepath];
			return buf ? buf.editorValue !== buf.savedContent : false;
		},
		[fileBuffers],
	);

	const hasUnsavedFiles = openFiles.some((fp) => {
		const buf = fileBuffers[fp];
		return buf ? buf.editorValue !== buf.savedContent : false;
	});

	const filteredFiles = useMemo(() => {
		if (!search.trim()) return files;
		const term = search.toLowerCase();
		return files.filter((f) => f.toLowerCase().includes(term));
	}, [files, search]);

	const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);
	const flatNodes = useMemo(
		() => flattenTree(tree, expandedDirectories),
		[expandedDirectories, tree],
	);

	const filteredPages = useMemo(() => {
		const term = previewPathInput.trim();
		if (!term || term === "/") return pages;
		return pages.filter(
			(p) =>
				p.path.toLowerCase().includes(term.toLowerCase()) ||
				p.name.toLowerCase().includes(term.toLowerCase()),
		);
	}, [pages, previewPathInput]);

	// ── effects ─────────────────────────────────────────────────────────────────

	useEffect(() => {
		selectedFileRef.current = selectedFile;
	}, [selectedFile]);

	useEffect(() => {
		if (typeof document === "undefined") return;
		const root = document.documentElement;
		const update = () =>
			setEditorTheme(root.classList.contains("dark") ? "vs-dark" : "vs");
		update();
		const observer = new MutationObserver(update);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!app) return;
		const parts = [];
		if (site) parts.push(`Current site: **${site}**`);
		parts.push(`Environment: **${userEnv}**`);
		if (selectedFile) parts.push(`Selected file: **${selectedFile}**`);
		app
			.updateModelContext({
				content:
					parts.length > 0 ? [{ type: "text", text: parts.join("\n\n") }] : [],
			})
			.catch(() => {});
		return () => {
			app.updateModelContext({ content: [] }).catch(() => {});
		};
	}, [app, userEnv, selectedFile, site]);

	useEffect(() => {
		if (viewMode !== "visual") {
			setVisualEditorElement(null);
			setVisualEditorInput("");
			return;
		}
		const handler = (event: MessageEvent) => {
			if (event.data?.type !== "visual-editor::element-clicked") return;
			setVisualEditorElement(event.data.payload as VisualEditorPayload);
			setVisualEditorInput("");
		};
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [viewMode]);

	useEffect(() => {
		if (visualEditorElement) {
			setTimeout(() => visualEditorInputRef.current?.focus(), 50);
		}
	}, [visualEditorElement]);

	useEffect(() => {
		if (codePromptSelection) {
			setTimeout(() => codePromptInputRef.current?.focus(), 50);
		}
	}, [codePromptSelection]);

	useEffect(() => {
		if (viewMode !== "code") {
			setCodePromptSelection(null);
			setCodePromptInput("");
		}
	}, [viewMode]);

	// Load git status when env is ready
	const loadGitStatus = useCallback(async () => {
		if (!app || !userEnv) return;
		try {
			const result = await app.callServerTool({
				name: "git_status",
				arguments: { env: userEnv },
			});
			if (!result?.isError) {
				const data = result?.structuredContent as GitStatus | undefined;
				if (data) setGitStatus(data);
			}
		} catch {
			// non-fatal
		}
	}, [app, userEnv]);

	useEffect(() => {
		if (envStatus === "ready") void loadGitStatus();
	}, [envStatus, loadGitStatus]);

	// Env warm-up
	useEffect(() => {
		if (!app || !userEnv) return;
		let cancelled = false;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;

		toast.loading("Starting your Live Preview…", {
			id: WARMUP_TOAST_ID,
			duration: Number.POSITIVE_INFINITY,
		});

		const tryListFiles = async (
			timeoutMs?: number,
		): Promise<string[] | null> => {
			try {
				const callPromise = app.callServerTool({
					name: "list_files",
					arguments: { env: userEnv },
				});
				const result = timeoutMs
					? await Promise.race([
							callPromise,
							new Promise<null>((resolve) =>
								setTimeout(() => resolve(null), timeoutMs),
							),
						])
					: await callPromise;
				if (!result || result.isError) return null;
				const data = result.structuredContent as ListFilesOutput | undefined;
				return data?.files ?? null;
			} catch {
				return null;
			}
		};

		const onEnvReady = (initialFiles: string[]) => {
			if (cancelled) return;
			setFiles(initialFiles);
			setEnvStatus("ready");
			toast.dismiss(WARMUP_TOAST_ID);
		};

		const schedulePoll = () => {
			pollTimer = setTimeout(async () => {
				if (cancelled) return;
				const f = await tryListFiles();
				if (cancelled) return;
				if (f !== null) onEnvReady(f);
				else schedulePoll();
			}, POLL_INTERVAL_MS);
		};

		tryListFiles(WARMUP_TIMEOUT_MS).then((f) => {
			if (cancelled) return;
			if (f !== null) {
				onEnvReady(f);
			} else {
				setEnvStatus("waiting");
				setPreviewUrl(null);
				schedulePoll();
			}
		});

		return () => {
			cancelled = true;
			if (pollTimer) clearTimeout(pollTimer);
			toast.dismiss(WARMUP_TOAST_ID);
		};
	}, [app, userEnv]);

	// Fetch preview URL
	useEffect(() => {
		if (
			(viewMode !== "preview" && viewMode !== "visual") ||
			envStatus !== "ready"
		)
			return;

		const refreshKey = previewRefreshKey;
		let cancelled = false;

		const run = async () => {
			void refreshKey;
			setIsLoadingPreview(true);
			setPreviewError(undefined);
			setPreviewUrl(null);
			try {
				const result = await app?.callServerTool({
					name: "preview_environment",
					arguments: {
						name: userEnv,
						path: previewPath,
					} satisfies PreviewEnvironmentInput,
				});
				if (result?.isError) {
					const text = result.content?.find((b) => b.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to load preview",
					);
				}
				const data = result?.structuredContent as
					| PreviewEnvironmentOutput
					| undefined;
				if (!data?.previewUrl) throw new Error("Preview URL was not returned");
				if (data.reachable === false) {
					const status =
						typeof data.httpStatus === "number"
							? ` (HTTP ${data.httpStatus}${data.httpStatusText ? ` ${data.httpStatusText}` : ""})`
							: "";
					throw new Error(
						data.error ??
							`Failed to load preview for "${previewPath}".${status}`,
					);
				}
				if (!cancelled) setPreviewUrl(data.previewUrl);
			} catch (error) {
				if (!cancelled) {
					setPreviewError(
						error instanceof Error ? error.message : "Failed to load preview",
					);
					setPreviewUrl(null);
				}
			} finally {
				if (!cancelled) setIsLoadingPreview(false);
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [app, envStatus, previewPath, previewRefreshKey, userEnv, viewMode]);

	// Load file content on selection
	useEffect(() => {
		if (!userEnv || !selectedFile) return;
		if (fileBuffers[selectedFile]?.loaded) return;

		let cancelled = false;
		const run = async () => {
			setIsLoadingFile(true);
			setFileError(undefined);
			try {
				const result = await app?.callServerTool({
					name: "read_file",
					arguments: { env: userEnv, filepath: selectedFile },
				});
				if (result?.isError) {
					const text = result.content?.find((b) => b.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to read file",
					);
				}
				if (cancelled) return;
				const data = result?.structuredContent as ReadFileOutput | undefined;
				const content = data?.content ?? "";
				setFileBuffers((prev) => ({
					...prev,
					[selectedFile]: {
						savedContent: content,
						editorValue: prev[selectedFile]?.editorValue ?? content,
						loaded: true,
					},
				}));
			} catch (error) {
				if (!cancelled)
					setFileError(
						error instanceof Error ? error.message : "Failed to read file",
					);
			} finally {
				if (!cancelled) setIsLoadingFile(false);
			}
		};
		run();
		return () => {
			cancelled = true;
		};
	}, [app, fileBuffers, userEnv, selectedFile]);

	// Close pages dropdown on outside click
	useEffect(() => {
		if (!pagesOpen) return;
		const handler = (e: PointerEvent) => {
			if (!pagesContainerRef.current?.contains(e.target as Node))
				setPagesOpen(false);
		};
		document.addEventListener("pointerdown", handler);
		return () => document.removeEventListener("pointerdown", handler);
	}, [pagesOpen]);

	// ── handlers ────────────────────────────────────────────────────────────────

	const loadFiles = useCallback(
		async (options?: {
			preserveSelection?: boolean;
			nextSelection?: string | null;
		}) => {
			setIsRefreshing(true);
			setListError(undefined);
			try {
				const result = await app?.callServerTool({
					name: "list_files",
					arguments: { env: userEnv },
				});
				if (result?.isError) {
					const text = result.content?.find((b) => b.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to load files",
					);
				}
				const data = result?.structuredContent as ListFilesOutput | undefined;
				const nextFiles = data?.files ?? [];
				setFiles(nextFiles);

				const requestedSelection = options?.nextSelection
					? normalizePath(options.nextSelection)
					: null;
				const currentSelectedFile = selectedFileRef.current;

				setOpenFiles((prev) => {
					const nextOpenFiles = prev.filter((path) => nextFiles.includes(path));
					const fileToKeepOpen =
						requestedSelection && nextFiles.includes(requestedSelection)
							? requestedSelection
							: options?.preserveSelection &&
									currentSelectedFile &&
									nextFiles.includes(currentSelectedFile)
								? currentSelectedFile
								: null;
					if (fileToKeepOpen && !nextOpenFiles.includes(fileToKeepOpen))
						nextOpenFiles.push(fileToKeepOpen);
					return nextOpenFiles;
				});

				if (requestedSelection) {
					setSelectedFile(requestedSelection);
				} else if (
					options?.preserveSelection &&
					currentSelectedFile &&
					nextFiles.includes(currentSelectedFile)
				) {
					setSelectedFile(currentSelectedFile);
				} else {
					setSelectedFile(null);
				}
			} catch (error) {
				setListError(
					error instanceof Error ? error.message : "Failed to load files",
				);
			} finally {
				setIsRefreshing(false);
			}
		},
		[app, userEnv],
	);

	const expandAncestors = useCallback((filepath: string) => {
		setExpandedDirectories((prev) => {
			const next = new Set(prev);
			for (const dir of getAncestorDirectories(filepath)) next.add(dir);
			return next;
		});
	}, []);

	const confirmLoseChanges = useCallback(() => {
		if (!hasUnsavedFiles) return true;
		return window.confirm(
			"You have unsaved changes. Do you want to discard them and continue?",
		);
	}, [hasUnsavedFiles]);

	const handleSelectFile = (filepath: string) => {
		const normalized = normalizePath(filepath);
		expandAncestors(normalized);
		setOpenFiles((prev) =>
			prev.includes(normalized) ? prev : [...prev, normalized],
		);
		setSelectedFile(normalized);
	};

	const handleCloseTab = useCallback(
		(filepath: string) => {
			const normalized = normalizePath(filepath);
			if (selectedFile === normalized && !confirmLoseChanges()) return;
			setOpenFiles((prev) => {
				const next = prev.filter((p) => p !== normalized);
				if (selectedFile === normalized) {
					const closedIndex = prev.indexOf(normalized);
					const fallback =
						next[closedIndex] ?? next[closedIndex - 1] ?? next[0] ?? null;
					setSelectedFile(fallback);
					if (!fallback) setFileError(undefined);
				}
				return next;
			});
		},
		[confirmLoseChanges, selectedFile],
	);

	const handleRefresh = async () => {
		if (viewMode === "preview" || viewMode === "visual") {
			setPreviewRefreshKey((prev) => prev + 1);
			return;
		}
		await loadFiles({ preserveSelection: true });
	};

	const handlePreviewPathSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setPreviewPath(normalizePath(previewPathInput));
	};

	const handleTogglePreviewViewport = () => {
		setPreviewViewport((prev) => (prev === "desktop" ? "mobile" : "desktop"));
	};

	const handleOpenPreviewInNewTab = () => {
		if (!envUrl) return;
		const nextPath = normalizePath(previewPathInput);
		const sep = nextPath.includes("?") ? "&" : "?";
		const url = `${envUrl}${nextPath.startsWith("/") ? "" : "/"}${nextPath}${sep}__cb=${crypto.randomUUID()}`;
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleEditorWillMount = useCallback<
		NonNullable<ComponentProps<typeof Editor>["beforeMount"]>
	>((m) => {
		m.languages.typescript.typescriptDefaults.setCompilerOptions({
			allowNonTsExtensions: true,
			jsx: m.languages.typescript.JsxEmit.ReactJSX,
			target: m.languages.typescript.ScriptTarget.ESNext,
		});
		m.languages.typescript.javascriptDefaults.setCompilerOptions({
			allowNonTsExtensions: true,
			jsx: m.languages.typescript.JsxEmit.ReactJSX,
			target: m.languages.typescript.ScriptTarget.ESNext,
		});
	}, []);

	const handleEditorChange = useCallback(
		(value: string | undefined) => {
			if (!selectedFile) return;
			setFileBuffers((prev) => ({
				...prev,
				[selectedFile]: {
					savedContent: prev[selectedFile]?.savedContent ?? "",
					editorValue: value ?? "",
					loaded: prev[selectedFile]?.loaded ?? true,
				},
			}));
		},
		[selectedFile],
	);

	const formatActiveDocument = useCallback(async () => {
		const editor = editorRef.current;
		const action = editor?.getAction("editor.action.formatDocument");
		if (!action) return;
		try {
			await action.run();
		} catch {
			// Monaco doesn't have a formatter for every language
		}
	}, []);

	const handleSave = useCallback(
		async (filepath = selectedFile) => {
			if (!userEnv || !filepath) return;
			const normalizedFilepath = normalizePath(filepath);
			setIsSaving(true);
			setFileError(undefined);
			try {
				if (normalizedFilepath === selectedFile) await formatActiveDocument();
				const nextValue =
					normalizedFilepath === selectedFile
						? (editorRef.current?.getValue() ??
							fileBuffers[normalizedFilepath]?.editorValue ??
							"")
						: (fileBuffers[normalizedFilepath]?.editorValue ?? "");
				const result = await app?.callServerTool({
					name: "write_file",
					arguments: {
						env: userEnv,
						filepath: normalizedFilepath,
						content: nextValue,
					},
				});
				if (result?.isError) {
					const text = result.content?.find((b) => b.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to save file",
					);
				}
				const data = result?.structuredContent as WriteFileOutput | undefined;
				if (!data?.success)
					throw new Error("Save was not accepted by the backend");
				setFileBuffers((prev) => ({
					...prev,
					[normalizedFilepath]: {
						savedContent: nextValue,
						editorValue: nextValue,
						loaded: true,
					},
				}));
				expandAncestors(normalizedFilepath);
				await loadFiles({
					preserveSelection: true,
					nextSelection:
						normalizedFilepath === selectedFile
							? normalizedFilepath
							: undefined,
				});
			} catch (error) {
				setFileError(
					error instanceof Error ? error.message : "Failed to save file",
				);
			} finally {
				setIsSaving(false);
			}
		},
		[
			app,
			expandAncestors,
			fileBuffers,
			formatActiveDocument,
			loadFiles,
			userEnv,
			selectedFile,
		],
	);

	useEffect(() => {
		saveActiveFileRef.current = () => handleSave(selectedFileRef.current);
	}, [handleSave]);

	const handleEditorDidMount: OnMount = useCallback((editor, m) => {
		editorRef.current = editor;
		editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
			void saveActiveFileRef.current?.();
		});
		editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyK, () => {
			const selection = editor.getSelection();
			const model = editor.getModel();
			const filepath = selectedFileRef.current;
			if (!selection || !model || !filepath) return;

			const hasSelection = !selection.isEmpty();
			const lineNumber = selection.startLineNumber;
			const lineRange = new m.Range(
				lineNumber,
				1,
				lineNumber,
				model.getLineMaxColumn(lineNumber),
			);
			const range = hasSelection ? selection : lineRange;
			const selectedText = model.getValueInRange(range).trim();
			if (!selectedText) return;

			const layout = editor.getLayoutInfo();
			const visiblePosition = editor.getScrolledVisiblePosition(
				range.getEndPosition(),
			);
			const popupWidth = 320;
			const padding = 12;
			const fallbackLeft = Math.max(
				padding,
				Math.min(
					layout.width / 2 - popupWidth / 2,
					layout.width - popupWidth - padding,
				),
			);
			const left = visiblePosition
				? Math.max(
						padding,
						Math.min(
							visiblePosition.left - popupWidth / 2,
							layout.width - popupWidth - padding,
						),
					)
				: fallbackLeft;
			const top = visiblePosition
				? Math.max(
						padding,
						Math.min(
							visiblePosition.top + visiblePosition.height + 8,
							layout.height - 48,
						),
					)
				: 16;

			setCodePromptSelection({
				filepath,
				startLine: range.startLineNumber,
				endLine: range.endLineNumber,
				selectedText,
				position: { left, top },
			});
			setCodePromptInput("");
		});
	}, []);

	const handleCodePromptSend = useCallback(async () => {
		if (!app || !codePromptSelection || !codePromptInput.trim()) return;
		setIsSendingCodePrompt(true);
		try {
			const language =
				getLanguageFromPath(codePromptSelection.filepath) || "text";
			const lines = [
				`The user selected code and asked: **"${codePromptInput.trim()}"**`,
				"",
				`**File:** \`${codePromptSelection.filepath}\``,
				`**Selected lines:** \`${codePromptSelection.startLine}-${codePromptSelection.endLine}\``,
				"",
				"**Selected code:**",
				`~~~${language}`,
				codePromptSelection.selectedText,
				"~~~",
				"",
				`Site: **${site}** - Environment: **${userEnv}**`,
				"",
				"Please apply the requested change using this code context.",
				"",
				"Check the file before the change to ensure the code is correct.",
			];

			app.sendMessage({
				role: "user",
				content: [{ type: "text", text: lines.join("\n") }],
			});
			setCodePromptSelection(null);
			setCodePromptInput("");
		} finally {
			setIsSendingCodePrompt(false);
		}
	}, [app, codePromptSelection, codePromptInput, site, userEnv]);

	const handleDelete = async (filepath = selectedFile) => {
		if (!userEnv || !filepath) return;
		const normalizedFilepath = normalizePath(filepath);
		const confirmed = window.confirm(
			`Delete ${normalizedFilepath}? This cannot be undone.`,
		);
		if (!confirmed) return;

		setIsDeleting(true);
		setFileError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "delete_file",
				arguments: { env: userEnv, filepath: normalizedFilepath },
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to delete file",
				);
			}
			const nextSelectedFile =
				selectedFile === normalizedFilepath ? null : selectedFile;
			setSelectedFile(nextSelectedFile);
			setOpenFiles((prev) => prev.filter((p) => p !== normalizedFilepath));
			setFileBuffers((prev) => {
				const next = { ...prev };
				delete next[normalizedFilepath];
				return next;
			});
			await loadFiles({
				preserveSelection: nextSelectedFile !== null,
				nextSelection: nextSelectedFile,
			});
		} catch (error) {
			setFileError(
				error instanceof Error ? error.message : "Failed to delete file",
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleCreateFile = async (event: FormEvent) => {
		event.preventDefault();
		const filepath = normalizePath(newFilePath);
		if (filepath === "/") {
			setCreateError("Enter a valid file path.");
			return;
		}
		setIsCreating(true);
		setCreateError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "write_file",
				arguments: { env: userEnv, filepath, content: "" },
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to create file",
				);
			}
			expandAncestors(filepath);
			setCreateDialogOpen(false);
			setNewFilePath("");
			await loadFiles({ nextSelection: filepath });
		} catch (error) {
			setCreateError(
				error instanceof Error ? error.message : "Failed to create file",
			);
		} finally {
			setIsCreating(false);
		}
	};

	const fetchPages = useCallback(async () => {
		if (!app || !userEnv || pagesLoaded || pagesLoading) return;
		setPagesLoading(true);
		try {
			const result = await app.callServerTool({
				name: "get_pages",
				arguments: { env: userEnv },
			});
			if (!result?.isError) {
				const data = result?.structuredContent as GetPagesOutput | undefined;
				setPages(data?.pages ?? []);
				setPagesLoaded(true);
			}
		} catch {
			// silently fail
		} finally {
			setPagesLoading(false);
		}
	}, [app, userEnv, pagesLoaded, pagesLoading]);

	const handleVisualEditorSend = useCallback(async () => {
		if (!visualEditorElement || !visualEditorInput.trim() || !app) return;
		const p = visualEditorElement;
		setIsSendingVisual(true);

		let matchedPage = null;
		try {
			const result = await app.callServerTool({
				name: "get_pages",
				arguments: { env: userEnv },
			});
			if (!result?.isError) {
				const data = result.structuredContent as GetPagesOutput | undefined;
				const allPages = data?.pages ?? [];
				const normalize = (s: string) => s.replace(/\/+$/, "") || "/";
				matchedPage =
					allPages.find((pg) => normalize(pg.path) === normalize(p.path)) ??
					null;
				setPages(allPages);
				setPagesLoaded(true);
			}
		} catch {
			// non-fatal
		} finally {
			setIsSendingVisual(false);
		}

		const lines = [
			`The user selected an element on the live preview and asked: **"${visualEditorInput.trim()}"**`,
			"",
			`For text content, understand which page the user is referring to and apply the change to the correct page at .deco/blocks folder.`,
			`For code and CSS changes, understand which component the user is referring to and apply changes to the correct component.`,
			"",
		];

		if (matchedPage) {
			lines.push(
				`**Page:** filepath \`.deco/blocks/${(matchedPage as PageInfo).key}.json\``,
				"",
				`If the content is not inside the page, note that the page can have Global Components inside, the content can be there.`,
			);
		} else {
			lines.push(`**Page path:** \`${p.path}\``, "");
		}

		if (p.manifestKey)
			lines.push(
				`**Section source file:** \`${p.manifestKey.replace("site/", "")}\``,
				"",
			);

		const selector = [
			`<${p.tag}`,
			p.classes ? ` class="${p.classes}"` : "",
			">",
		].join("");
		lines.push(`**Clicked element:** \`${selector}\``);
		if (p.parents) lines.push(`**DOM breadcrumb:** ${p.parents} > ${p.tag}`);
		if (p.text) lines.push(`**Text content:** "${p.text}"`);
		if (p.componentName) lines.push(`**Component name:** ${p.componentName}`);
		lines.push("", "**HTML snippet:**", "```html", p.html, "```");
		lines.push("", `Site: **${site}** — Environment: **${userEnv}**`);
		lines.push(
			"",
			"Please read the source file, locate the element, and apply the requested change.",
		);

		app.sendMessage({
			role: "user",
			content: [{ type: "text", text: lines.join("\n") }],
		});

		setVisualEditorElement(null);
		setVisualEditorInput("");
	}, [app, visualEditorElement, visualEditorInput, site, userEnv]);

	// ── render ───────────────────────────────────────────────────────────────────

	return (
		<div className="h-dvh overflow-hidden">
			<div className="flex h-full min-h-0 flex-col gap-4">
				{listError && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
						{listError}
					</div>
				)}
				{fileError && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
						{fileError}
					</div>
				)}

				<div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
					<div className="flex h-full min-h-0 flex-col">
						{/* ── toolbar ── */}
						<div className="flex items-center justify-between gap-3 border-b px-3 py-2">
							{/* View mode switcher */}
							<div className="flex shrink-0 items-center rounded-lg border bg-muted/40">
								<button
									type="button"
									className={cn(
										"flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
										viewMode === "preview"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
									onClick={() => setViewMode("preview")}
									disabled={envStatus !== "ready"}
									title="Preview"
								>
									<Eye className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									className={cn(
										"flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
										viewMode === "visual"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
									onClick={() => setViewMode("visual")}
									disabled={envStatus !== "ready"}
									title="Visual editor — click any element to ask the AI about it"
								>
									<MousePointer2 className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									className={cn(
										"flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
										viewMode === "code"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
									onClick={() => setViewMode("code")}
									title="Code"
								>
									<FileCode2 className="h-3.5 w-3.5" />
								</button>
							</div>

							{/* URL bar */}
							<div
								ref={pagesContainerRef}
								className="relative min-w-0 flex-1 max-w-xl"
							>
								<form
									onSubmit={(e) => {
										setPagesOpen(false);
										handlePreviewPathSubmit(e);
									}}
								>
									<div className="flex h-7 items-center gap-2 rounded-lg border bg-background px-0.5">
										<button
											type="button"
											className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
											onClick={handleTogglePreviewViewport}
											title={
												previewViewport === "desktop"
													? "Switch to mobile preview"
													: "Switch to desktop preview"
											}
										>
											{previewViewport === "desktop" ? (
												<Monitor className="h-3.5 w-3.5" />
											) : (
												<Smartphone className="h-3.5 w-3.5" />
											)}
										</button>
										<Input
											value={previewPathInput}
											onChange={(event) =>
												setPreviewPathInput(event.target.value)
											}
											onClick={() => {
												if (envStatus === "ready") {
													setPagesOpen(true);
													void fetchPages();
												}
											}}
											onKeyDown={(e) => {
												if (e.key === "Escape") setPagesOpen(false);
											}}
											placeholder="/"
											className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
										/>
										<div className="flex items-center gap-0.5">
											<button
												type="button"
												className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
												onClick={handleOpenPreviewInNewTab}
												disabled={!envUrl || envStatus !== "ready"}
												title="Open in new tab"
											>
												<ExternalLink className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
												onClick={handleRefresh}
												title={
													viewMode === "preview"
														? "Refresh preview"
														: "Refresh file list"
												}
											>
												<RefreshCw
													className={cn(
														"h-3.5 w-3.5",
														(isRefreshing || isLoadingPreview) &&
															"animate-spin",
													)}
												/>
											</button>
										</div>
									</div>
								</form>

								{pagesOpen && (
									<div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
										{pagesLoading ? (
											<div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
												Loading pages…
											</div>
										) : filteredPages.length === 0 ? (
											<div className="px-3 py-3 text-xs text-muted-foreground">
												{pages.length === 0
													? "No pages found in this environment."
													: "No pages match your search."}
											</div>
										) : (
											<ScrollArea className="max-h-64">
												<div className="p-1">
													{filteredPages.map((page) => (
														<button
															key={page.key}
															type="button"
															className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
															onMouseDown={(e) => {
																e.preventDefault();
																setPreviewPathInput(page.path);
																setPreviewPath(page.path);
																setPagesOpen(false);
															}}
														>
															<LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
															<span className="flex-1 truncate font-medium">
																{page.name}
															</span>
															<span className="shrink-0 text-xs text-muted-foreground">
																{page.path}
															</span>
														</button>
													))}
												</div>
											</ScrollArea>
										)}
									</div>
								)}
							</div>

							{/* Publish button */}
							<div className="shrink-0">
								<Button
									type="button"
									className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md"
									onClick={() => setPublishDialogOpen(true)}
									disabled={envStatus !== "ready"}
								>
									Publish
								</Button>
							</div>
						</div>

						{/* ── main content ── */}
						<div className="flex min-h-0 flex-1">
							{/* File tree sidebar */}
							{viewMode === "code" ? (
								<div className="w-80 shrink-0 border-r">
									<div className="flex h-full min-h-0 flex-col">
										<div className="border-b p-1.5">
											<div className="relative">
												<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={search}
													onChange={(event) => setSearch(event.target.value)}
													placeholder="Filter files by path..."
													className="h-8 pl-9 text-sm"
												/>
											</div>
										</div>
										<ScrollArea className="min-h-0 flex-1">
											<div className="p-2">
												{envStatus !== "ready" ? (
													<div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
														<Loader2 className="h-4 w-4 animate-spin" />
														<span className="text-xs text-center">
															{envStatus === "warming-up"
																? "Connecting to your environment…"
																: "Waiting for environment to start…"}
														</span>
													</div>
												) : flatNodes.length === 0 ? (
													<Empty className="border-none">
														<EmptyHeader>
															<EmptyMedia variant="icon">
																<File className="size-5" />
															</EmptyMedia>
															<EmptyTitle>
																{search
																	? "No matching files"
																	: "No files found"}
															</EmptyTitle>
															<EmptyDescription>
																{search
																	? "Try a different filter or refresh the filesystem snapshot."
																	: "This environment does not have any visible files yet."}
															</EmptyDescription>
														</EmptyHeader>
													</Empty>
												) : (
													<div>
														{flatNodes.map(({ node, depth }) => {
															const isDirectory = node.kind === "directory";
															const isExpanded = expandedDirectories.has(
																node.path,
															);
															const isSelected = selectedFile === node.path;
															const canSaveFile =
																!isDirectory &&
																!isReadonly &&
																!isSaving &&
																!isDeleting &&
																isPathDirty(node.path);
															const canDeleteFile =
																!isDirectory &&
																!isReadonly &&
																!isDeleting &&
																!isSaving;

															const rowButton = (
																<button
																	type="button"
																	key={node.path}
																	className={cn(
																		"flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent",
																		isSelected &&
																			"bg-accent text-accent-foreground",
																	)}
																	style={{ paddingLeft: `${depth * 12 + 8}px` }}
																	onClick={() => {
																		if (isDirectory) {
																			setExpandedDirectories((prev) => {
																				const next = new Set(prev);
																				if (next.has(node.path))
																					next.delete(node.path);
																				else next.add(node.path);
																				return next;
																			});
																			return;
																		}
																		handleSelectFile(node.path);
																	}}
																	onContextMenu={() => {
																		if (!isDirectory)
																			handleSelectFile(node.path);
																	}}
																	title={node.path}
																>
																	{isDirectory ? (
																		<>
																			{node.children.length > 0 ? (
																				isExpanded ? (
																					<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
																				) : (
																					<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
																				)
																			) : (
																				<span className="h-3 w-3 shrink-0" />
																			)}
																			{isExpanded ? (
																				<FolderOpen className="h-3.5 w-3.5 shrink-0 text-chart-4" />
																			) : (
																				<Folder className="h-3.5 w-3.5 shrink-0 text-chart-4" />
																			)}
																		</>
																	) : (
																		<>
																			<span className="h-3 w-3 shrink-0" />
																			<FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
																		</>
																	)}
																	<span className="truncate">{node.name}</span>
																</button>
															);

															return isDirectory ? (
																<div key={node.path}>{rowButton}</div>
															) : (
																<ContextMenu key={node.path}>
																	<ContextMenuTrigger asChild>
																		{rowButton}
																	</ContextMenuTrigger>
																	<ContextMenuContent className="w-44">
																		<ContextMenuItem
																			disabled={!canSaveFile}
																			onSelect={() =>
																				void handleSave(node.path)
																			}
																		>
																			<Save className="h-4 w-4" />
																			Save
																		</ContextMenuItem>
																		<ContextMenuItem
																			variant="destructive"
																			disabled={!canDeleteFile}
																			onSelect={() =>
																				void handleDelete(node.path)
																			}
																		>
																			<Trash2 className="h-4 w-4" />
																			Delete
																		</ContextMenuItem>
																	</ContextMenuContent>
																</ContextMenu>
															);
														})}
													</div>
												)}
											</div>
										</ScrollArea>
									</div>
								</div>
							) : null}

							{/* Editor / preview area */}
							<div className="min-w-0 flex-1">
								<div className="flex h-full min-h-0 flex-col">
									{viewMode === "code" ? (
										<>
											{/* Tabs */}
											<div className="flex items-center justify-between gap-3 border-b h-[45px]">
												<div className="min-w-0 flex-1 overflow-x-auto">
													<div className="flex min-w-max items-end px-2 pt-2">
														{openFiles.length === 0 ? (
															<div className="px-2 py-2 text-sm text-muted-foreground">
																No file selected
															</div>
														) : (
															openFiles.map((filepath) => {
																const isActive = selectedFile === filepath;
																const isTabDirty = isPathDirty(filepath);
																const canSaveTab =
																	!isReadonly &&
																	!isSaving &&
																	!isDeleting &&
																	isTabDirty;
																const canDeleteTab =
																	!isReadonly && !isDeleting && !isSaving;

																const tab = (
																	<div
																		className={cn(
																			"mr-1 flex items-center gap-1 rounded-t-md border border-b-0 px-3 py-2 text-sm",
																			isActive
																				? "bg-background text-foreground"
																				: "bg-muted/40 text-muted-foreground",
																		)}
																	>
																		<button
																			type="button"
																			className="flex max-w-40 items-center gap-1.5 truncate text-left"
																			title={filepath}
																			onClick={() => handleSelectFile(filepath)}
																			onContextMenu={() =>
																				handleSelectFile(filepath)
																			}
																		>
																			<span className="truncate">
																				{getBasename(filepath)}
																			</span>
																			{isTabDirty ? (
																				<span
																					className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70"
																					title="Unsaved changes"
																				/>
																			) : null}
																		</button>
																		<button
																			type="button"
																			className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
																			title={`Close ${getBasename(filepath)}`}
																			onClick={() => handleCloseTab(filepath)}
																		>
																			<X className="h-3 w-3" />
																		</button>
																	</div>
																);

																return (
																	<ContextMenu key={filepath}>
																		<ContextMenuTrigger asChild>
																			{tab}
																		</ContextMenuTrigger>
																		<ContextMenuContent className="w-44">
																			<ContextMenuItem
																				disabled={!canSaveTab}
																				onSelect={() =>
																					void handleSave(filepath)
																				}
																			>
																				<Save className="h-4 w-4" />
																				Save
																			</ContextMenuItem>
																			<ContextMenuItem
																				variant="destructive"
																				disabled={!canDeleteTab}
																				onSelect={() =>
																					void handleDelete(filepath)
																				}
																			>
																				<Trash2 className="h-4 w-4" />
																				Delete
																			</ContextMenuItem>
																		</ContextMenuContent>
																	</ContextMenu>
																);
															})
														)}
													</div>
												</div>
											</div>

											{/* Editor */}
											<div className="min-h-0 flex-1 overflow-hidden">
												{!selectedFile ? (
													<Empty className="h-full rounded-none border-none">
														<EmptyHeader>
															<EmptyMedia variant="icon">
																<File className="size-5" />
															</EmptyMedia>
															<EmptyTitle>Select a file</EmptyTitle>
															<EmptyDescription>
																Choose a file from the sidebar to inspect or
																edit it.
															</EmptyDescription>
														</EmptyHeader>
													</Empty>
												) : isLoadingFile || !currentFileBuffer?.loaded ? (
													<div className="flex h-full items-center justify-center">
														<div className="flex items-center gap-3 text-muted-foreground">
															<Loader2 className="h-4 w-4 animate-spin" />
															<span className="text-sm">Loading file...</span>
														</div>
													</div>
												) : (
													<div className="relative h-full">
														<Editor
															path={selectedFile}
															language={getLanguageFromPath(selectedFile)}
															value={currentFileBuffer?.editorValue ?? ""}
															theme={editorTheme}
															beforeMount={handleEditorWillMount}
															onMount={handleEditorDidMount}
															onChange={handleEditorChange}
															options={{
																automaticLayout: true,
																fontFamily:
																	'ui-monospace, "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
																fontLigatures: true,
																fontSize: 13,
																lineHeight: 22,
																minimap: { enabled: false },
																padding: { top: 16, bottom: 16 },
																quickSuggestions: true,
																readOnly: isReadonly,
																renderLineHighlight: "gutter",
																scrollBeyondLastLine: false,
																smoothScrolling: true,
																tabSize: 2,
																wordWrap: "on",
															}}
														/>
														{viewMode === "code" && codePromptSelection && (
															<div
																className="absolute z-20 pointer-events-none"
																style={{
																	left: `${codePromptSelection.position.left}px`,
																	top: `${codePromptSelection.position.top}px`,
																	width: "320px",
																}}
															>
																<form
																	className="pointer-events-auto flex w-full items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 shadow-xl backdrop-blur-sm"
																	onSubmit={(e) => {
																		e.preventDefault();
																		void handleCodePromptSend();
																	}}
																>
																	<input
																		ref={codePromptInputRef}
																		type="text"
																		value={codePromptInput}
																		onChange={(e) =>
																			setCodePromptInput(e.target.value)
																		}
																		onKeyDown={(e) => {
																			if (e.key === "Escape") {
																				setCodePromptSelection(null);
																				setCodePromptInput("");
																			}
																		}}
																		placeholder="Ask the AI..."
																		className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
																	/>
																	<button
																		type="submit"
																		disabled={
																			!codePromptInput.trim() ||
																			isSendingCodePrompt
																		}
																		className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
																		title="Send"
																	>
																		{isSendingCodePrompt ? (
																			<Loader2 className="h-3 w-3 animate-spin" />
																		) : (
																			<svg
																				width="10"
																				height="10"
																				viewBox="0 0 10 10"
																				fill="none"
																				aria-hidden="true"
																			>
																				<title>Send</title>
																				<path
																					d="M5 9V1M1 5l4-4 4 4"
																					stroke="currentColor"
																					strokeWidth="1.5"
																					strokeLinecap="round"
																					strokeLinejoin="round"
																				/>
																			</svg>
																		)}
																	</button>
																</form>
															</div>
														)}
													</div>
												)}
											</div>
										</>
									) : (
										/* Preview / visual editor */
										<div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
											{envStatus === "warming-up" ? (
												<div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-background/80">
													<div className="flex flex-col items-center gap-3 text-muted-foreground">
														<Loader2 className="h-5 w-5 animate-spin" />
														<span className="text-sm">
															Starting your Live Preview…
														</span>
													</div>
												</div>
											) : envStatus === "waiting" ? (
												<div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-background/80">
													<div className="flex flex-col items-center gap-3 text-muted-foreground">
														<Loader2 className="h-5 w-5 animate-spin" />
														<span className="text-sm">
															Preview is starting. This can take a moment...
														</span>
													</div>
												</div>
											) : previewError ? (
												<PreviewErrorFallback />
											) : (
												<div className="flex h-full items-center justify-center overflow-auto bg-background">
													<div
														className={cn(
															"relative h-full min-h-[480px] overflow-hidden bg-background shadow-sm transition-[width,border-radius] duration-300 ease-out",
															previewViewport === "mobile"
																? "w-[390px] max-w-full"
																: "w-full",
														)}
													>
														{(isLoadingPreview || !previewUrl) && (
															<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
																<div className="flex items-center gap-3 text-muted-foreground">
																	<Loader2 className="h-4 w-4 animate-spin" />
																	<span className="text-sm">
																		Loading preview...
																	</span>
																</div>
															</div>
														)}

														{viewMode === "visual" &&
															previewUrl &&
															!visualEditorElement && (
																<div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/90 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm pointer-events-none select-none">
																	<MousePointer2 className="h-3 w-3" />
																	Click any element to ask the AI
																</div>
															)}

														{viewMode === "visual" &&
															visualEditorElement &&
															(() => {
																const POPUP_W = 320;
																const POPUP_H = 44;
																const PAD = 12;
																const { x, y } = visualEditorElement.position;
																const { width: vw, height: vh } =
																	visualEditorElement.viewport;
																const left = Math.max(
																	PAD,
																	Math.min(x - POPUP_W / 2, vw - POPUP_W - PAD),
																);
																const isNearBottom = y / vh > 0.68;
																const top = isNearBottom
																	? Math.max(PAD, y - POPUP_H - 18)
																	: Math.min(y + 18, vh - POPUP_H - PAD);
																return (
																	<div
																		className="absolute z-30 pointer-events-none"
																		style={{
																			left: `${(left / vw) * 100}%`,
																			top: `${(top / vh) * 100}%`,
																			width: `${POPUP_W}px`,
																		}}
																	>
																		<form
																			className="pointer-events-auto flex w-full items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 shadow-xl backdrop-blur-sm"
																			onSubmit={(e) => {
																				e.preventDefault();
																				void handleVisualEditorSend();
																			}}
																		>
																			<input
																				ref={visualEditorInputRef}
																				type="text"
																				value={visualEditorInput}
																				onChange={(e) =>
																					setVisualEditorInput(e.target.value)
																				}
																				onKeyDown={(e) => {
																					if (e.key === "Escape") {
																						setVisualEditorElement(null);
																						setVisualEditorInput("");
																					}
																				}}
																				placeholder="Ask the AI..."
																				className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
																			/>
																			<button
																				type="submit"
																				disabled={
																					!visualEditorInput.trim() ||
																					isSendingVisual
																				}
																				className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
																				title="Send"
																			>
																				{isSendingVisual ? (
																					<Loader2 className="h-3 w-3 animate-spin" />
																				) : (
																					<svg
																						width="10"
																						height="10"
																						viewBox="0 0 10 10"
																						fill="none"
																						aria-hidden="true"
																					>
																						<title>Send</title>
																						<path
																							d="M5 9V1M1 5l4-4 4 4"
																							stroke="currentColor"
																							strokeWidth="1.5"
																							strokeLinecap="round"
																							strokeLinejoin="round"
																						/>
																					</svg>
																				)}
																			</button>
																		</form>
																	</div>
																);
															})()}

														{previewUrl ? (
															<iframe
																key={previewUrl}
																ref={previewIframeRef}
																src={previewUrl}
																title={`Preview of ${userEnv} at ${previewPath}`}
																className="h-full w-full border-0"
																onLoad={() => {
																	if (viewMode !== "visual") return;
																	const win =
																		previewIframeRef.current?.contentWindow;
																	if (!win) return;
																	try {
																		const script =
																			win.document.createElement("script");
																		script.textContent = `(${visualEditorScript.toString()})()`;
																		win.document.head.appendChild(script);
																	} catch {
																		win.postMessage(
																			{
																				type: "editor::inject",
																				args: {
																					script: `(${visualEditorScript.toString()})()`,
																				},
																			},
																			"*",
																		);
																	}
																}}
															/>
														) : null}
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* ── create file dialog ── */}
			<Dialog
				open={createDialogOpen}
				onOpenChange={(open) => {
					if (!isCreating) setCreateDialogOpen(open);
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="text-base">Create file</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleCreateFile} className="space-y-4">
						<div className="space-y-1.5">
							<label
								htmlFor="new-file-path"
								className="text-xs font-medium text-muted-foreground"
							>
								File path
							</label>
							<Input
								id="new-file-path"
								value={newFilePath}
								onChange={(event) => setNewFilePath(event.target.value)}
								placeholder="/sections/home.tsx"
								autoFocus
								disabled={isCreating}
							/>
						</div>
						{createError && (
							<p className="text-xs text-destructive">{createError}</p>
						)}
						<DialogFooter>
							<Button
								type="submit"
								size="sm"
								className="gap-1.5"
								disabled={!newFilePath.trim() || isCreating}
							>
								{isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
								Create
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* ── publish dialog ── */}
			<PublishDialog
				open={publishDialogOpen}
				onOpenChange={setPublishDialogOpen}
				userEnv={userEnv}
				envUrl={envUrl}
				showPreviewAction={isPreviewSupported}
				editorTheme={editorTheme}
				gitStatus={gitStatus}
				onGitStatusChange={setGitStatus}
			/>
		</div>
	);
}

// ─── page entry point ─────────────────────────────────────────────────────────

export default function FileExplorerPage() {
	const state = useMcpState<FileExplorerInput, FileExplorerOutput>();

	if (state.status === "initializing") {
		return <Spinner label="Connecting to host..." />;
	}

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">File Explorer</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Call{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								file_explorer
							</Badge>{" "}
							to browse and edit environment files.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") return <CancelledView />;
	if (state.status === "tool-input")
		return <Spinner label="Opening file explorer..." />;

	const { site, userEnv, userEnvUrl, isPreviewSupported } =
		state.toolResult ?? {
			site: "",
			userEnv: "",
			userEnvUrl: null,
			isPreviewSupported: true,
		};

	return (
		<FileExplorerWorkspace
			site={site}
			userEnv={userEnv}
			userEnvUrl={userEnvUrl}
			isPreviewSupported={isPreviewSupported}
		/>
	);
}
