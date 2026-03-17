import Editor, { loader, type OnMount } from "@monaco-editor/react";
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

type ViewMode = "code" | "preview";
type PreviewViewport = "desktop" | "mobile";
type EnvStatus = "warming-up" | "waiting" | "ready";

type TreeNode = {
	name: string;
	path: string;
	kind: "directory" | "file";
	children: TreeNode[];
};

type FlatNode = {
	node: TreeNode;
	depth: number;
};

type FileBuffer = {
	savedContent: string;
	editorValue: string;
	loaded: boolean;
};

loader.config({ monaco });

globalThis.MonacoEnvironment = {
	getWorker(_workerId, label) {
		if (label === "json") {
			return new jsonWorker();
		}
		if (label === "css" || label === "scss" || label === "less") {
			return new cssWorker();
		}
		if (label === "html" || label === "handlebars" || label === "razor") {
			return new htmlWorker();
		}
		if (label === "typescript" || label === "javascript") {
			return new tsWorker();
		}
		return new editorWorker();
	},
};

function normalizePath(path: string) {
	if (!path.trim()) {
		return "/";
	}

	const normalized = path.startsWith("/") ? path : `/${path}`;
	return normalized.replace(/\/+/g, "/");
}

function getBasename(path: string) {
	const normalized = normalizePath(path);
	return normalized.split("/").filter(Boolean).pop() ?? "/";
}

function getLanguageFromPath(filepath: string | null) {
	if (!filepath) {
		return "plaintext";
	}

	const normalized = filepath.toLowerCase();

	if (normalized.endsWith(".tsx") || normalized.endsWith(".ts")) {
		return "typescript";
	}
	if (
		normalized.endsWith(".jsx") ||
		normalized.endsWith(".js") ||
		normalized.endsWith(".mjs") ||
		normalized.endsWith(".cjs")
	) {
		return "javascript";
	}
	if (normalized.endsWith(".json")) {
		return "json";
	}
	if (normalized.endsWith(".md") || normalized.endsWith(".mdx")) {
		return "markdown";
	}
	if (normalized.endsWith(".css")) {
		return "css";
	}
	if (normalized.endsWith(".scss")) {
		return "scss";
	}
	if (normalized.endsWith(".html")) {
		return "html";
	}
	if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
		return "yaml";
	}
	if (normalized.endsWith(".xml") || normalized.endsWith(".svg")) {
		return "xml";
	}
	if (normalized.endsWith(".py")) {
		return "python";
	}
	if (normalized.endsWith(".sql")) {
		return "sql";
	}
	if (normalized.endsWith(".sh")) {
		return "shell";
	}

	return "plaintext";
}

function getAncestorDirectories(filepath: string) {
	const parts = normalizePath(filepath).split("/").filter(Boolean);
	const directories = ["/"];
	let current = "";

	for (const part of parts.slice(0, -1)) {
		current += `/${part}`;
		directories.push(current);
	}

	return directories;
}

function buildFileTree(files: string[]): TreeNode[] {
	const root: TreeNode = {
		name: "/",
		path: "/",
		kind: "directory",
		children: [],
	};

	for (const rawFile of files) {
		const file = normalizePath(rawFile);
		const parts = file.split("/").filter(Boolean);
		let current = root;
		let currentPath = "";

		parts.forEach((part, index) => {
			currentPath += `/${part}`;
			const isFile = index === parts.length - 1;
			let child = current.children.find((entry) => entry.name === part);

			if (!child) {
				child = {
					name: part,
					path: currentPath,
					kind: isFile ? "file" : "directory",
					children: [],
				};
				current.children.push(child);
			}

			current = child;
		});
	}

	const sortNodes = (nodes: TreeNode[]) => {
		nodes.sort((a, b) => {
			if (a.kind !== b.kind) {
				return a.kind === "directory" ? -1 : 1;
			}

			return a.name.localeCompare(b.name);
		});

		for (const node of nodes) {
			if (node.children.length > 0) {
				sortNodes(node.children);
			}
		}
	};

	sortNodes(root.children);
	return root.children;
}

function flattenTree(
	nodes: TreeNode[],
	expandedDirectories: Set<string>,
	depth = 0,
): FlatNode[] {
	const rows: FlatNode[] = [];

	for (const node of nodes) {
		rows.push({ node, depth });

		if (
			node.kind === "directory" &&
			node.children.length > 0 &&
			expandedDirectories.has(node.path)
		) {
			rows.push(...flattenTree(node.children, expandedDirectories, depth + 1));
		}
	}

	return rows;
}

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

const WARMUP_TOAST_ID = "env-warmup";
const WARMUP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 5000;

function FileExplorerWorkspace({
	site,
	userEnv,
	userEnvUrl,
	productionUrl,
}: {
	site: string;
	userEnv: string;
	userEnvUrl: string | null;
	productionUrl: string;
}) {
	const app = useMcpApp();
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
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [newFilePath, setNewFilePath] = useState("");
	const [createError, setCreateError] = useState<string>();
	const [isCreating, setIsCreating] = useState(false);
	const [pages, setPages] = useState<PageInfo[]>([]);
	const [pagesLoaded, setPagesLoaded] = useState(false);
	const [pagesLoading, setPagesLoading] = useState(false);
	const [pagesOpen, setPagesOpen] = useState(false);
	const selectedFileRef = useRef<string | null>(null);
	const saveActiveFileRef = useRef<(() => Promise<void>) | null>(null);
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
	const pagesContainerRef = useRef<HTMLDivElement>(null);
	const [editorTheme, setEditorTheme] = useState<"vs" | "vs-dark">(() =>
		typeof document !== "undefined" &&
		document.documentElement.classList.contains("dark")
			? "vs-dark"
			: "vs",
	);
	const [viewMode, setViewMode] = useState<ViewMode>("preview");
	const [previewViewport, setPreviewViewport] =
		useState<PreviewViewport>("desktop");
	const [previewPathInput, setPreviewPathInput] = useState("/");
	const [previewPath, setPreviewPath] = useState("/");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string>();
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

	useEffect(() => {
		selectedFileRef.current = selectedFile;
	}, [selectedFile]);

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}

		const root = document.documentElement;
		const updateTheme = () => {
			setEditorTheme(root.classList.contains("dark") ? "vs-dark" : "vs");
		};

		updateTheme();

		const observer = new MutationObserver(updateTheme);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, []);

	const isReadonly = false;
	const envUrl = userEnvUrl;

	const currentFileBuffer = selectedFile
		? fileBuffers[selectedFile]
		: undefined;
	const isPathDirty = useCallback(
		(filepath: string) => {
			const fileBuffer = fileBuffers[filepath];
			return fileBuffer
				? fileBuffer.editorValue !== fileBuffer.savedContent
				: false;
		},
		[fileBuffers],
	);
	const hasUnsavedFiles = openFiles.some((filepath) => {
		const fileBuffer = fileBuffers[filepath];
		return fileBuffer
			? fileBuffer.editorValue !== fileBuffer.savedContent
			: false;
	});

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
					const text = result.content?.find((block) => block.type === "text");
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

					if (fileToKeepOpen && !nextOpenFiles.includes(fileToKeepOpen)) {
						nextOpenFiles.push(fileToKeepOpen);
					}

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

	// Warm-up: try to connect to the user's env within 5s.
	// If it times out, show the production URL in the iframe and poll every 5s.
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
				const files = await tryListFiles();
				if (cancelled) return;
				if (files !== null) {
					onEnvReady(files);
				} else {
					schedulePoll();
				}
			}, POLL_INTERVAL_MS);
		};

		tryListFiles(WARMUP_TIMEOUT_MS).then((files) => {
			if (cancelled) return;
			if (files !== null) {
				onEnvReady(files);
			} else {
				setEnvStatus("waiting");
				setPreviewUrl(
					`${productionUrl}${productionUrl.endsWith("/") ? "" : "/"}?__cb=${crypto.randomUUID()}`,
				);
				schedulePoll();
			}
		});

		return () => {
			cancelled = true;
			if (pollTimer) clearTimeout(pollTimer);
			toast.dismiss(WARMUP_TOAST_ID);
		};
	}, [app, userEnv, productionUrl]);

	// Fetch preview URL from the env once it's ready
	useEffect(() => {
		if (viewMode !== "preview" || envStatus !== "ready") {
			return;
		}

		const refreshKey = previewRefreshKey;
		let cancelled = false;

		const run = async () => {
			void refreshKey;
			setIsLoadingPreview(true);
			setPreviewError(undefined);

			try {
				const result = await app?.callServerTool({
					name: "preview_environment",
					arguments: {
						name: userEnv,
						path: previewPath,
					} satisfies PreviewEnvironmentInput,
				});

				if (result?.isError) {
					const text = result.content?.find((block) => block.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to load preview",
					);
				}

				const data = result?.structuredContent as
					| PreviewEnvironmentOutput
					| undefined;
				if (!data?.previewUrl) {
					throw new Error("Preview URL was not returned");
				}

				if (!cancelled) {
					setPreviewUrl(data.previewUrl);
				}
			} catch (error) {
				if (!cancelled) {
					setPreviewError(
						error instanceof Error ? error.message : "Failed to load preview",
					);
					setPreviewUrl(null);
				}
			} finally {
				if (!cancelled) {
					setIsLoadingPreview(false);
				}
			}
		};

		void run();

		return () => {
			cancelled = true;
		};
	}, [app, envStatus, previewPath, previewRefreshKey, userEnv, viewMode]);

	useEffect(() => {
		if (!userEnv || !selectedFile) {
			return;
		}

		if (fileBuffers[selectedFile]?.loaded) {
			return;
		}

		let cancelled = false;

		const run = async () => {
			setIsLoadingFile(true);
			setFileError(undefined);

			try {
				const result = await app?.callServerTool({
					name: "read_file",
					arguments: {
						env: userEnv,
						filepath: selectedFile,
					},
				});
				if (result?.isError) {
					const text = result.content?.find((block) => block.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to read file",
					);
				}

				if (cancelled) {
					return;
				}

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
				if (!cancelled) {
					setFileError(
						error instanceof Error ? error.message : "Failed to read file",
					);
				}
			} finally {
				if (!cancelled) {
					setIsLoadingFile(false);
				}
			}
		};

		run();

		return () => {
			cancelled = true;
		};
	}, [app, fileBuffers, userEnv, selectedFile]);

	useEffect(() => {
		if (!app) {
			return;
		}

		const parts = [];
		if (site) {
			parts.push(`Current site: **${site}**`);
		}
		parts.push(`Environment: **${userEnv}**`);
		if (selectedFile) {
			parts.push(`Selected file: **${selectedFile}**`);
		}

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

	// Close the pages dropdown when clicking outside the URL bar container
	useEffect(() => {
		if (!pagesOpen) return;
		const handler = (e: PointerEvent) => {
			if (!pagesContainerRef.current?.contains(e.target as Node)) {
				setPagesOpen(false);
			}
		};
		document.addEventListener("pointerdown", handler);
		return () => document.removeEventListener("pointerdown", handler);
	}, [pagesOpen]);

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
			// silently fail — user can still type a path manually
		} finally {
			setPagesLoading(false);
		}
	}, [app, userEnv, pagesLoaded, pagesLoading]);

	const filteredPages = useMemo(() => {
		const term = previewPathInput.trim();
		if (!term || term === "/") return pages;
		return pages.filter(
			(p) =>
				p.path.toLowerCase().includes(term.toLowerCase()) ||
				p.name.toLowerCase().includes(term.toLowerCase()),
		);
	}, [pages, previewPathInput]);

	const filteredFiles = useMemo(() => {
		if (!search.trim()) {
			return files;
		}

		const term = search.toLowerCase();
		return files.filter((file) => file.toLowerCase().includes(term));
	}, [files, search]);

	const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);
	const flatNodes = useMemo(
		() => flattenTree(tree, expandedDirectories),
		[expandedDirectories, tree],
	);

	const expandAncestors = useCallback((filepath: string) => {
		setExpandedDirectories((prev) => {
			const next = new Set(prev);
			for (const directory of getAncestorDirectories(filepath)) {
				next.add(directory);
			}
			return next;
		});
	}, []);

	const confirmLoseChanges = useCallback(() => {
		if (!hasUnsavedFiles) {
			return true;
		}

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

			if (selectedFile === normalized && !confirmLoseChanges()) {
				return;
			}

			setOpenFiles((prev) => {
				const next = prev.filter((path) => path !== normalized);

				if (selectedFile === normalized) {
					const closedIndex = prev.indexOf(normalized);
					const fallback =
						next[closedIndex] ?? next[closedIndex - 1] ?? next[0] ?? null;
					setSelectedFile(fallback);

					if (!fallback) {
						setFileError(undefined);
					}
				}

				return next;
			});
		},
		[confirmLoseChanges, selectedFile],
	);

	const handleRefresh = async () => {
		if (viewMode === "preview") {
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
		if (!envUrl) {
			return;
		}

		const nextPath = normalizePath(previewPathInput);
		const sep = nextPath.includes("?") ? "&" : "?";
		const url = `${envUrl}${nextPath.startsWith("/") ? "" : "/"}${nextPath}${sep}__cb=${crypto.randomUUID()}`;
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleEditorWillMount = useCallback<
		NonNullable<ComponentProps<typeof Editor>["beforeMount"]>
	>((monaco) => {
		monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
			allowNonTsExtensions: true,
			jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
			target: monaco.languages.typescript.ScriptTarget.ESNext,
		});
		monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
			allowNonTsExtensions: true,
			jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
			target: monaco.languages.typescript.ScriptTarget.ESNext,
		});
	}, []);

	const handleEditorChange = useCallback(
		(value: string | undefined) => {
			if (!selectedFile) {
				return;
			}

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

		if (!action) {
			return;
		}

		try {
			await action.run();
		} catch {
			// Monaco doesn't provide formatters for every language. Save should still work.
		}
	}, []);

	const handleSave = useCallback(
		async (filepath = selectedFile) => {
			if (!userEnv || !filepath) {
				return;
			}

			const normalizedFilepath = normalizePath(filepath);
			setIsSaving(true);
			setFileError(undefined);

			try {
				if (normalizedFilepath === selectedFile) {
					await formatActiveDocument();
				}
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
					const text = result.content?.find((block) => block.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to save file",
					);
				}

				const data = result?.structuredContent as WriteFileOutput | undefined;
				if (!data?.success) {
					throw new Error("Save was not accepted by the backend");
				}

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

	const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
		editorRef.current = editor;
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
			void saveActiveFileRef.current?.();
		});
	}, []);

	const handleDelete = async (filepath = selectedFile) => {
		if (!userEnv || !filepath) {
			return;
		}

		const normalizedFilepath = normalizePath(filepath);
		const confirmed = window.confirm(
			`Delete ${normalizedFilepath}? This cannot be undone.`,
		);
		if (!confirmed) {
			return;
		}

		setIsDeleting(true);
		setFileError(undefined);

		try {
			const result = await app?.callServerTool({
				name: "delete_file",
				arguments: {
					env: userEnv,
					filepath: normalizedFilepath,
				},
			});
			if (result?.isError) {
				const text = result.content?.find((block) => block.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to delete file",
				);
			}

			const nextSelectedFile =
				selectedFile === normalizedFilepath ? null : selectedFile;

			setSelectedFile(nextSelectedFile);
			setOpenFiles((prev) =>
				prev.filter((path) => path !== normalizedFilepath),
			);
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
				arguments: {
					env: userEnv,
					filepath,
					content: "",
				},
			});
			if (result?.isError) {
				const text = result.content?.find((block) => block.type === "text");
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
						<div className="flex items-center justify-between gap-3 border-b px-3 py-2">
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
							<div className="shrink-0">
								<Button
									type="button"
									className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md"
								>
									Publish
								</Button>
							</div>
						</div>

						<div className="flex min-h-0 flex-1">
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
																				if (next.has(node.path)) {
																					next.delete(node.path);
																				} else {
																					next.add(node.path);
																				}
																				return next;
																			});
																			return;
																		}

																		handleSelectFile(node.path);
																	}}
																	onContextMenu={() => {
																		if (!isDirectory) {
																			handleSelectFile(node.path);
																		}
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

							<div className="min-w-0 flex-1">
								<div className="flex h-full min-h-0 flex-col">
									{viewMode === "code" ? (
										<>
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
												)}
											</div>
										</>
									) : (
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
											) : previewError ? (
												<div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-background p-6">
													<div className="max-w-md text-center">
														<p className="text-sm font-medium">
															Preview failed
														</p>
														<p className="mt-2 text-sm text-muted-foreground">
															{previewError}
														</p>
													</div>
												</div>
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
														{previewUrl ? (
															<iframe
																key={previewUrl}
																src={previewUrl}
																title={`Preview of ${userEnv} at ${previewPath}`}
																className="h-full w-full border-0"
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

			<Dialog
				open={createDialogOpen}
				onOpenChange={(open) => {
					if (!isCreating) {
						setCreateDialogOpen(open);
					}
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
		</div>
	);
}

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

	if (state.status === "error") {
		return <ErrorView error={state.error} />;
	}

	if (state.status === "tool-cancelled") {
		return <CancelledView />;
	}

	if (state.status === "tool-input") {
		return <Spinner label="Opening file explorer..." />;
	}

	const { site, userEnv, userEnvUrl, productionUrl } = state.toolResult ?? {
		site: "",
		userEnv: "",
		userEnvUrl: null,
		productionUrl: "",
	};

	return (
		<FileExplorerWorkspace
			site={site}
			userEnv={userEnv}
			userEnvUrl={userEnvUrl}
			productionUrl={productionUrl}
		/>
	);
}
