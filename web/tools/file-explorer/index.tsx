import type { OnMount } from "@monaco-editor/react";
import Editor, { loader } from "@monaco-editor/react";
import {
	DndContext,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Crosshair,
	ExternalLink,
	Eye,
	File,
	FileCode2,
	Folder,
	FolderOpen,
	GripVertical,
	LayersIcon,
	LayoutTemplate,
	Loader2,
	Monitor,
	MousePointer2,
	MoreHorizontal,
	Package,
	PanelLeft,
	Plus,
	RefreshCw,
	Save,
	Search,
	Smartphone,
	Trash2,
	X,
	Zap,
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
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
	CreatePageOutput,
	FileExplorerInput,
	FileExplorerOutput,
	GetBlockSchemaOutput,
	GetPageSectionsOutput,
	GetPagesOutput,
	ListAppsOutput,
	ListFilesOutput,
	ListSectionsOutput,
	PageInfo,
	ReadFileOutput,
	WriteFileOutput,
} from "../../../api/tools/files.ts";
import type { SchemaProperties } from "./cms-form.tsx";
import type { GitStatus } from "../../../api/tools/git.ts";
import { PublishDialog } from "./publish-dialog.tsx";
import { SectionForm } from "./cms-form.tsx";
import type {
	CmsInspectPayload,
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

// ─── cms inspect script ───────────────────────────────────────────────────────

function cmsInspectScript() {
	const win = window as unknown as Record<string, unknown>;
	if (win.__cmsInspect) {
		(win.__cmsInspect as { enable: () => void }).enable();
		return;
	}

	let enabled = true;

	const LEAF =
		"section[data-manifest-key]:not(:has(section[data-manifest-key]))";
	const DEFERRED_CHILD =
		'section[data-manifest-key$="Deferred.tsx"] > section[data-manifest-key]';
	const WRAPPER_ATTR = "data-cms-inspect-overlay";

	const formatLabel = (key: string) => {
		const parts = key.split("/");
		const file = parts[parts.length - 1];
		return file.replace(/\.(tsx|ts|jsx|js)$/, "").replace(/[-_]/g, " ");
	};

	const CSS = `
		${LEAF}:hover, ${DEFERRED_CHILD}:hover {
			position: relative;
		}
		${LEAF}:hover > [${WRAPPER_ATTR}],
		${DEFERRED_CHILD}:hover > [${WRAPPER_ATTR}] {
			display: flex;
		}
		[${WRAPPER_ATTR}] {
			display: none;
			position: absolute;
			inset: 0;
			z-index: 2147483647;
			outline: 2px solid #0ea5e9;
			background: rgba(14,165,233,0.08);
			cursor: pointer;
			align-items: flex-start;
			justify-content: flex-start;
			pointer-events: none;
		}
		[${WRAPPER_ATTR}] > [data-cms-badge] {
			position: absolute;
			top: 0;
			left: 0;
			transform: translateY(-100%);
			background: #0ea5e9;
			color: white;
			font: 11px/1.2 system-ui, sans-serif;
			padding: 3px 8px;
			border-radius: 3px 3px 0 0;
			white-space: nowrap;
			max-width: 280px;
			overflow: hidden;
			text-overflow: ellipsis;
			pointer-events: none;
		}
	`;

	const style = document.createElement("style");
	style.textContent = CSS;
	document.head.appendChild(style);

	const injectOverlays = () => {
		const sections = [
			...Array.from(document.querySelectorAll(LEAF)),
			...Array.from(document.querySelectorAll(DEFERRED_CHILD)),
		];
		const seen = new Set<Element>();
		for (const section of sections) {
			if (seen.has(section)) continue;
			seen.add(section);
			if (section.querySelector(`[${WRAPPER_ATTR}]`)) continue;
			const key =
				(section as HTMLElement).getAttribute("data-manifest-key") || "";
			const overlay = document.createElement("div");
			overlay.setAttribute(WRAPPER_ATTR, "");
			const badge = document.createElement("div");
			badge.setAttribute("data-cms-badge", "");
			badge.textContent = formatLabel(key);
			overlay.appendChild(badge);
			section.prepend(overlay);
		}
	};

	const removeOverlays = () => {
		document.querySelectorAll(`[${WRAPPER_ATTR}]`).forEach((el) => el.remove());
	};

	const enable = () => {
		enabled = true;
		style.textContent = CSS;
		injectOverlays();
	};

	const disable = () => {
		enabled = false;
		removeOverlays();
		style.textContent = "";
	};

	win.__cmsInspect = { enable, disable };

	injectOverlays();

	document.addEventListener(
		"click",
		(e) => {
			if (!enabled) return;
			const el = e.target as HTMLElement;
			const section = el.closest(LEAF) || el.closest(DEFERRED_CHILD);
			if (!section) return;

			e.preventDefault();
			e.stopImmediatePropagation();

			const overlay = section.querySelector(
				`[${WRAPPER_ATTR}]`,
			) as HTMLElement | null;
			if (overlay) {
				overlay.style.outline = "2px solid #0284c7";
				overlay.style.background = "rgba(2,132,199,0.18)";
				setTimeout(() => {
					overlay.style.outline = "";
					overlay.style.background = "";
				}, 400);
			}

			const manifestKey =
				(section as HTMLElement).getAttribute("data-manifest-key") || "";
			const allSections = Array.from(document.querySelectorAll(LEAF));
			const sectionIndex = allSections.indexOf(section);

			const tag = el.tagName.toLowerCase();
			const id = el.id || "";
			const classes =
				el.className && typeof el.className === "string"
					? el.className.trim()
					: "";
			const text = (el.textContent || "").trim().slice(0, 200);
			const html = (el.outerHTML || "").slice(0, 800);

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
					type: "cms-inspect::section-clicked",
					payload: {
						manifestKey,
						sectionIndex,
						tag,
						id,
						classes,
						text,
						html,
						componentName,
						parents: parents.join(" > "),
						url: window.location.href,
						path: window.location.pathname,
						viewport: {
							width: window.innerWidth,
							height: window.innerHeight,
						},
						position: { x: Math.round(e.clientX), y: Math.round(e.clientY) },
					},
				},
				"*",
			);
		},
		true,
	);

	window.addEventListener("message", (e) => {
		if (e.data?.type === "cms-inspect::toggle") {
			if (e.data.enabled) {
				enable();
			} else {
				disable();
			}
		}
	});
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

// ─── sortable section row ─────────────────────────────────────────────────────

function SortableSectionItem({
	section,
	onSelect,
	onDuplicate,
	onRemove,
	onToggleLazy,
}: {
	section: {
		index: number;
		resolveType: string;
		label: string;
		isLazy?: boolean;
		isSavedBlock?: boolean;
	};
	onSelect: () => void;
	onDuplicate: () => void;
	onRemove: () => void;
	onToggleLazy: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: String(section.index) });

	const saved = section.isSavedBlock === true;

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.4 : 1,
			}}
			{...listeners}
			{...attributes}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onSelect();
			}}
			className={cn(
				"group flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 transition-colors active:cursor-grabbing",
				saved
					? "text-[oklch(0.45_0.15_289)] hover:bg-[oklch(0.7278_0.151_289/0.12)] dark:text-[oklch(0.78_0.15_289)] dark:hover:bg-[oklch(0.7278_0.151_289/0.15)]"
					: "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
			)}
		>
			<GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
			<LayoutTemplate
				className="h-3.5 w-3.5 shrink-0"
				style={saved ? { color: "oklch(0.7278 0.151 289)" } : undefined}
			/>
			<span className="flex-1 truncate text-xs font-medium" onClick={onSelect}>
				{section.label}
			</span>
			<button
				type="button"
				onPointerDown={(e) => e.stopPropagation()}
				onClick={(e) => {
					e.stopPropagation();
					onToggleLazy();
				}}
				title={section.isLazy ? "Remove lazy" : "Make lazy"}
				className={cn(
					"shrink-0 rounded p-0.5 transition-colors hover:bg-background/80",
					section.isLazy
						? "text-yellow-500"
						: "text-muted-foreground/30 opacity-0 group-hover:opacity-100",
				)}
			>
				<Zap className="h-3 w-3" />
			</button>{" "}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100"
					>
						<MoreHorizontal className="h-3.5 w-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-32">
					<DropdownMenuItem
						onSelect={(e) => {
							e.stopPropagation();
							onDuplicate();
						}}
					>
						Duplicate
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(e) => {
							e.stopPropagation();
							onRemove();
						}}
						className="text-destructive focus:text-destructive"
					>
						Remove
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

// ─── Apps panel ───────────────────────────────────────────────────────────────

interface AppsPanelProps {
	loading: boolean;
	data: ListAppsOutput | null;
	installingApps: Set<string>;
	onClose: () => void;
	onSelectApp: (blockId: string, configPath: string, title: string) => void;
	onInstall: (name: string, vendor: string) => void;
	onUninstall: (name: string, vendor: string) => void;
}

function AppsPanel({
	loading,
	data,
	installingApps,
	onClose,
	onSelectApp,
	onInstall,
	onUninstall,
}: AppsPanelProps) {
	const [search, setSearch] = useState("");

	const grouped = data?.apps
		? Object.groupBy(
				data.apps.filter(
					(a) =>
						!search ||
						a.title.toLowerCase().includes(search.toLowerCase()) ||
						a.description.toLowerCase().includes(search.toLowerCase()),
				),
				(a) => a.category,
			)
		: {};

	return (
		<div className="m-4 absolute top-0 left-0 bottom-0 z-30 flex w-80 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
			{/* Header */}
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
				<Package className="h-4 w-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 text-sm font-semibold">Apps</span>
				<button
					type="button"
					onClick={onClose}
					className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					title="Close Apps panel"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* Search */}
			<div className="border-b px-3 py-2">
				<div className="relative">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search apps…"
						className="h-7 pl-8 text-xs"
					/>
				</div>
			</div>

			{/* Body */}
			{loading ? (
				<div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span className="text-sm">Loading apps…</span>
				</div>
			) : !data || data.apps.length === 0 ? (
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					No apps found
				</div>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<div className="py-3 flex flex-col gap-4">
						{Object.entries(grouped)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([category, apps]) => (
								<div key={category} className="flex flex-col gap-1">
									<span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
										{category}
									</span>
									<div className="flex flex-col">
										{apps?.map((app) => {
											const isBusy = installingApps.has(app.blockId);
											return (
												<div
													key={app.blockId}
													className={cn(
														"group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent",
														isBusy && "pointer-events-none opacity-60",
													)}
													onClick={() => {
														if (app.installed && !isBusy) {
															onSelectApp(
																app.blockId,
																app.configPath,
																app.title,
															);
														}
													}}
													title={
														app.installed
															? `Configure ${app.title}`
															: `Install ${app.title}`
													}
												>
													{/* Logo */}
													<div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border bg-muted flex items-center justify-center">
														{app.logo ? (
															<img
																src={app.logo}
																alt={app.name}
																className="h-full w-full object-cover"
															/>
														) : (
															<Package className="h-4 w-4 text-muted-foreground" />
														)}
													</div>

													{/* Info */}
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-1.5">
															<span className="truncate text-xs font-medium leading-tight">
																{app.title}
															</span>
														</div>
														<span className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
															{app.description}
														</span>
													</div>

													{/* Action button */}
													{isBusy ? (
														<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
													) : app.installed ? (
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																onUninstall(app.name, app.vendor);
															}}
															className="hidden shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
															title={`Uninstall ${app.title}`}
														>
															Uninstall
														</button>
													) : (
														<Button
															size="sm"
															variant="outline"
															className="hidden h-6 shrink-0 rounded-md px-2.5 text-[11px] font-medium"
															onClick={(e) => {
																e.stopPropagation();
																onInstall(app.name, app.vendor);
															}}
															title={`Install ${app.title}`}
														>
															Install
														</Button>
													)}
												</div>
											);
										})}
									</div>
								</div>
							))}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}

// ─── CMS panel ────────────────────────────────────────────────────────────────

interface CmsPanelProps {
	loading: boolean;
	error?: string;
	data: GetPageSectionsOutput | null;
	selectedSection: number | null;
	sectionData: Record<string, unknown> | null;
	sectionSchema: SchemaProperties | null;
	schemasMap: Record<string, SchemaProperties>;
	autoSaving: boolean;
	savedBlock: false | "readonly" | "editing";
	onSelectSection: (idx: number) => void;
	onDeselectSection: () => void;
	onChangeSectionData: (data: Record<string, unknown>) => void;
	onReorderSections: (srcIdx: number, destIdx: number) => void;
	onDuplicateSection: (listIdx: number) => void;
	onRemoveSection: (listIdx: number) => void;
	onToggleLazySection: (listIdx: number) => void;
	onPageMetaChange: (name: string, path: string) => void;
	onAddSection: () => void;
	onClose: () => void;
	onSavedBlockEdit: () => void;
	onSavedBlockCancel: () => void;
	onSavedBlockSave: () => void;
}

function CmsPanel({
	loading,
	error,
	data,
	selectedSection,
	sectionData,
	sectionSchema,
	schemasMap,
	autoSaving,
	savedBlock,
	onSelectSection,
	onDeselectSection,
	onChangeSectionData,
	onReorderSections,
	onDuplicateSection,
	onRemoveSection,
	onToggleLazySection,
	onPageMetaChange,
	onAddSection,
	onClose,
	onSavedBlockEdit,
	onSavedBlockCancel,
	onSavedBlockSave,
}: CmsPanelProps) {
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 250, tolerance: 5 },
		}),
	);

	const [editName, setEditName] = useState(
		(data?.pageData.name as string | undefined) ?? "",
	);
	const [editPath, setEditPath] = useState(
		(data?.pageData.path as string | undefined) ?? "",
	);

	useEffect(() => {
		setEditName((data?.pageData.name as string | undefined) ?? "");
		setEditPath((data?.pageData.path as string | undefined) ?? "");
	}, [data?.pageKey]);

	const isEditing = selectedSection !== null && sectionData !== null;
	const activeSection = data?.sections[selectedSection ?? -1];
	const sortableIds = data?.sections.map((s) => String(s.index)) ?? [];

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id || !data) return;
		const srcIdx = data.sections.findIndex(
			(s) => String(s.index) === active.id,
		);
		const destIdx = data.sections.findIndex((s) => String(s.index) === over.id);
		if (srcIdx !== -1 && destIdx !== -1) onReorderSections(srcIdx, destIdx);
	};

	const editingGlobally = savedBlock === "editing";

	return (
		<div
			className="m-4 absolute top-0 left-0 bottom-0 z-30 flex w-72 flex-col overflow-hidden rounded-xl border shadow-2xl transition-colors"
			style={
				editingGlobally
					? {
							borderColor: "oklch(0.7278 0.151 289 / 0.35)",
							background: "oklch(0.97 0.01 289)",
							boxShadow:
								"0 25px 50px -12px oklch(0.7278 0.151 289 / 0.2), 0 0 0 1px oklch(0.7278 0.151 289 / 0.1)",
						}
					: { background: "var(--background, #fff)" }
			}
		>
			{/* Header */}
			{isEditing ? (
				<div
					className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5 transition-colors"
					style={
						editingGlobally
							? { borderColor: "oklch(0.7278 0.151 289 / 0.2)" }
							: undefined
					}
				>
					<button
						type="button"
						onClick={onDeselectSection}
						className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Back to sections"
					>
						<ChevronLeft className="h-3.5 w-3.5" />
					</button>
					<span className="flex-1 truncate text-sm font-semibold">
						{activeSection?.label ?? "Edit"}
					</span>
					{editingGlobally && (
						<span
							className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
							style={{
								background: "oklch(0.7278 0.151 289 / 0.12)",
								color: "oklch(0.5 0.15 289)",
							}}
						>
							editing
						</span>
					)}
					{autoSaving && !savedBlock && (
						<Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
					)}
				</div>
			) : (
				<div className="shrink-0 border-b px-3 pb-2.5 pt-2.5">
					<div className="flex items-center gap-2">
						<div className="flex flex-1 flex-col">
							<input
								value={editName}
								onChange={(e) => {
									setEditName(e.target.value);
									onPageMetaChange(e.target.value, editPath);
								}}
								className="truncate bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50 hover:bg-accent/40 focus:bg-accent/60 rounded px-1 -mx-1"
								placeholder="Page name"
							/>
							<input
								value={editPath}
								onChange={(e) => {
									setEditPath(e.target.value);
									onPageMetaChange(editName, e.target.value);
								}}
								className="-mt-1 truncate bg-transparent text-[10px] text-muted-foreground outline-none placeholder:text-muted-foreground/40 hover:bg-accent/40 focus:bg-accent/60 rounded px-1 -mx-1"
								placeholder="/path"
							/>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							title="Close CMS panel"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			)}

			{/* Body */}
			{loading ? (
				<div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span className="text-sm">Loading sections…</span>
				</div>
			) : error ? (
				<div className="p-3 text-xs text-destructive">{error}</div>
			) : !data ? (
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					No page data
				</div>
			) : isEditing && sectionData ? (
				<SectionForm
					data={sectionData}
					schema={sectionSchema ?? undefined}
					schemasMap={schemasMap}
					onChange={onChangeSectionData}
					readOnly={savedBlock === "readonly"}
					savedBlockKey={
						savedBlock ? (activeSection?.savedBlockKey ?? undefined) : undefined
					}
					onEditGlobally={onSavedBlockEdit}
					onSaveGlobally={onSavedBlockSave}
					onCancelGlobally={onSavedBlockCancel}
					saving={autoSaving && savedBlock === "editing"}
				/>
			) : (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{data.sections.length === 0 ? (
							<div className="px-2 py-3 text-xs text-muted-foreground">
								No sections on this page.
							</div>
						) : (
							<DndContext
								sensors={sensors}
								modifiers={[restrictToVerticalAxis]}
								onDragEnd={handleDragEnd}
							>
								<SortableContext
									items={sortableIds}
									strategy={verticalListSortingStrategy}
								>
									{data.sections.map((section) => (
										<SortableSectionItem
											key={String(section.index)}
											section={section}
											onSelect={() => onSelectSection(section.index)}
											onDuplicate={() => onDuplicateSection(section.index)}
											onRemove={() => onRemoveSection(section.index)}
											onToggleLazy={() => onToggleLazySection(section.index)}
										/>
									))}
								</SortableContext>
							</DndContext>
						)}
					</div>
					<div className="shrink-0 border-t p-2">
						<button
							type="button"
							onClick={onAddSection}
							className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<Plus className="h-3.5 w-3.5" />
							Add section
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

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

	// ── create page dialog state ─────────────────────────────────────────────────
	const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
	const [newPageName, setNewPageName] = useState("My New Page");
	const [newPagePath, setNewPagePath] = useState("/example-path");
	const [isCreatingPage, setIsCreatingPage] = useState(false);
	const [createPageError, setCreatePageError] = useState<string>();

	// ── publish ─────────────────────────────────────────────────────────────────
	const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
	const [publishDialogOpen, setPublishDialogOpen] = useState(false);

	// ── CMS state ────────────────────────────────────────────────────────────────
	const [cmsOpen, setCmsOpen] = useState(false);
	const [cmsPanelVisible, setCmsPanelVisible] = useState(true);
	const [cmsData, setCmsData] = useState<GetPageSectionsOutput | null>(null);
	const [cmsLoading, setCmsLoading] = useState(false);
	const [cmsError, setCmsError] = useState<string | undefined>();
	const [cmsSelectedSection, setCmsSelectedSection] = useState<number | null>(
		null,
	);
	const [cmsSectionData, setCmsSectionData] = useState<Record<
		string,
		unknown
	> | null>(null);
	const [cmsAutoSaving, setCmsAutoSaving] = useState(false);
	const cmsDataRef = useRef<GetPageSectionsOutput | null>(null);
	const cmsSelectedSectionRef = useRef<number | null>(null);
	const cmsAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const [cmsSectionSchema, setCmsSectionSchema] =
		useState<SchemaProperties | null>(null);
	const [cmsSchemasMap, setCmsSchemasMap] = useState<
		Record<string, SchemaProperties>
	>({});
	const [cmsSavedBlock, setCmsSavedBlock] = useState<
		false | "readonly" | "editing"
	>(false);

	// ── CMS inspect state ────────────────────────────────────────────────────
	const [cmsInspectActive, setCmsInspectActive] = useState(false);
	const [cmsInspectElement, setCmsInspectElement] =
		useState<CmsInspectPayload | null>(null);
	const [cmsInspectInput, setCmsInspectInput] = useState("");
	const [isSendingCmsInspect, setIsSendingCmsInspect] = useState(false);

	// ── Add-section picker state ──────────────────────────────────────────────
	const [addSectionOpen, setAddSectionOpen] = useState(false);
	const [addSectionSearch, setAddSectionSearch] = useState("");
	const [addSectionSections, setAddSectionSections] =
		useState<ListSectionsOutput | null>(null);
	const [addSectionLoading, setAddSectionLoading] = useState(false);

	// ── Apps state ───────────────────────────────────────────────────────────────
	const [appsOpen, setAppsOpen] = useState(false);
	const [appsData, setAppsData] = useState<ListAppsOutput | null>(null);
	const [appsLoading, setAppsLoading] = useState(false);
	const [installingApps, setInstallingApps] = useState<Set<string>>(
		() => new Set(),
	);
	const [appConfigModalOpen, setAppConfigModalOpen] = useState(false);
	const [appConfigTitle, setAppConfigTitle] = useState("");
	const [appConfigData, setAppConfigData] = useState<Record<
		string,
		unknown
	> | null>(null);
	const [appConfigSchema, setAppConfigSchema] =
		useState<SchemaProperties | null>(null);
	const [appConfigLoading, setAppConfigLoading] = useState(false);

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
	const fileBuffersRef = useRef(fileBuffers);
	fileBuffersRef.current = fileBuffers;
	const saveActiveFileRef = useRef<(() => Promise<void>) | null>(null);
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
	const pagesContainerRef = useRef<HTMLDivElement>(null);
	const previewIframeRef = useRef<HTMLIFrameElement>(null);
	const visualEditorInputRef = useRef<HTMLInputElement>(null);
	const cmsInspectInputRef = useRef<HTMLInputElement>(null);
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
		cmsDataRef.current = cmsData;
	}, [cmsData]);

	useEffect(() => {
		cmsSelectedSectionRef.current = cmsSelectedSection;
	}, [cmsSelectedSection]);

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
		const win = previewIframeRef.current?.contentWindow;
		if (!win) return;

		if (cmsOpen && cmsInspectActive) {
			try {
				const api = (win as unknown as Record<string, unknown>).__cmsInspect as
					| { enable: () => void }
					| undefined;
				if (api) {
					api.enable();
				} else {
					const script = win.document.createElement("script");
					script.textContent = `(${cmsInspectScript.toString()})()`;
					win.document.head.appendChild(script);
				}
			} catch {
				win.postMessage(
					{
						type: "editor::inject",
						args: { script: `(${cmsInspectScript.toString()})()` },
					},
					"*",
				);
			}
		} else {
			try {
				const api = (win as unknown as Record<string, unknown>).__cmsInspect as
					| { disable: () => void }
					| undefined;
				if (api) {
					api.disable();
				} else {
					win.postMessage({ type: "cms-inspect::toggle", enabled: false }, "*");
				}
			} catch {
				try {
					win.postMessage({ type: "cms-inspect::toggle", enabled: false }, "*");
				} catch {}
			}
		}
	}, [cmsOpen, cmsInspectActive]);

	const cmsInspectHandlerRef = useRef<(payload: CmsInspectPayload) => void>(
		() => {},
	);
	cmsInspectHandlerRef.current = (payload: CmsInspectPayload) => {
		if (!cmsData) return;
		const { manifestKey, sectionIndex } = payload;
		const sections = cmsData.sections;
		const rawSections = cmsData.pageData.sections as Array<{
			__resolveType?: string;
			section?: { __resolveType?: string };
		}>;

		const basename = (s: string) => {
			const parts = s.split("/");
			return parts[parts.length - 1];
		};

		const getEffectiveRt = (sec: (typeof sections)[number], i: number) => {
			if (sec.isSavedBlock && sec.resolvedResolveType) {
				return sec.resolvedResolveType;
			}
			const r = rawSections[i];
			if (sec.isLazy) {
				return r?.section?.__resolveType ?? sec.resolveType;
			}
			return r?.__resolveType ?? sec.resolveType;
		};

		const matchesKey = (ert: string, key: string) =>
			ert === key || basename(ert) === basename(key);

		const matchingIndices = sections
			.map((sec, i) => ({ i, ert: getEffectiveRt(sec, i) }))
			.filter(({ ert }) => matchesKey(ert, manifestKey));

		let matchedIdx: number;
		if (matchingIndices.length === 1) {
			matchedIdx = matchingIndices[0].i;
		} else if (matchingIndices.length > 1) {
			const occurrence = Math.min(
				matchingIndices.length - 1,
				Math.max(0, sectionIndex),
			);
			matchedIdx = matchingIndices[occurrence].i;
		} else {
			matchedIdx = -1;
		}

		if (matchedIdx >= 0 && matchedIdx < sections.length) {
			handleCmsSelectSection(matchedIdx);
		}
	};

	useEffect(() => {
		if (!cmsOpen || !cmsInspectActive) {
			setCmsInspectElement(null);
			setCmsInspectInput("");
			return;
		}
		const handler = (event: MessageEvent) => {
			if (event.data?.type !== "cms-inspect::section-clicked") return;
			const payload = event.data.payload as CmsInspectPayload;
			setCmsInspectElement(payload);
			setCmsInspectInput("");
			cmsInspectHandlerRef.current(payload);
		};
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [cmsOpen, cmsInspectActive]);

	useEffect(() => {
		if (cmsInspectElement) {
			setTimeout(() => cmsInspectInputRef.current?.focus(), 50);
		}
	}, [cmsInspectElement]);

	useEffect(() => {
		setCmsInspectElement(null);
		setCmsInspectInput("");
	}, [previewPath]);

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

	// Refresh preview and invalidate open file buffers on detected file changes
	// Poll git_status every 5 s; on any change, treat files as stale
	const lastGitStatusRef = useRef<string | null>(null);

	useEffect(() => {
		if (envStatus !== "ready" || !app || !userEnv) return;
		let cancelled = false;

		const check = async () => {
			try {
				const result = await app.callServerTool({
					name: "git_status",
					arguments: { env: userEnv },
				});
				if (cancelled || result?.isError) return;
				const data = result?.structuredContent as GitStatus | undefined;
				if (!data) return;
				setGitStatus(data);
				const snapshot = JSON.stringify(data);
				if (lastGitStatusRef.current === null) {
					// First reading — just store baseline
					lastGitStatusRef.current = snapshot;
				} else if (snapshot !== lastGitStatusRef.current) {
					lastGitStatusRef.current = snapshot;
					setPreviewRefreshKey((k) => k + 1);
					setFileBuffers((prev) => {
						const next: typeof prev = {};
						for (const [fp, buf] of Object.entries(prev)) {
							next[fp] = { ...buf, loaded: false };
						}
						return next;
					});
				}
			} catch {
				// non-fatal
			}
		};

		void check();
		const interval = setInterval(() => void check(), 5_000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [app, envStatus, userEnv]);

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

	// Refresh preview and invalidate open file buffers on detected file changes

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
		if (fileBuffersRef.current[selectedFile]?.loaded) return;

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
	}, [app, userEnv, selectedFile]);

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

	// Fetch CMS sections when panel is open or preview path changes
	useEffect(() => {
		if (!cmsOpen || !app || !userEnv || envStatus !== "ready") return;
		let cancelled = false;
		const fetch = async () => {
			setCmsLoading(true);
			setCmsError(undefined);
			setCmsData(null);
			setCmsSelectedSection(null);
			setCmsSectionData(null);

			const MAX_RETRIES = 5;
			const RETRY_DELAY_MS = 1500;

			for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
				if (cancelled) return;
				try {
					const result = await app.callServerTool({
						name: "get_page_sections",
						arguments: { env: userEnv, path: previewPath },
					});
					if (cancelled) return;
					if (result?.isError) {
						const text = result.content?.find((b) => b.type === "text");
						const msg =
							text?.type === "text"
								? text.text
								: "Failed to load page sections";
						// Page not propagated yet — retry
						if (
							msg.toLowerCase().includes("no page found") &&
							attempt < MAX_RETRIES
						) {
							await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
							continue;
						}
						throw new Error(msg);
					}
					const data = result?.structuredContent as
						| GetPageSectionsOutput
						| undefined;
					setCmsData(data ?? null);
					setCmsLoading(false);
					return;
				} catch (e) {
					const msg =
						e instanceof Error ? e.message : "Failed to load sections";
					if (
						msg.toLowerCase().includes("no page found") &&
						attempt < MAX_RETRIES
					) {
						await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
						continue;
					}
					if (!cancelled) {
						setCmsError(msg);
						setCmsLoading(false);
					}
					return;
				}
			}
		};
		void fetch();
		return () => {
			cancelled = true;
		};
	}, [cmsOpen, previewPath, userEnv, envStatus, app]);

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

	// ── Apps handlers ────────────────────────────────────────────────────────────

	const fetchApps = useCallback(async () => {
		if (!app || !userEnv || appsLoading) return;
		setAppsLoading(true);
		try {
			const result = await app.callServerTool({
				name: "list_apps",
				arguments: { env: userEnv },
			});
			if (!result?.isError) {
				setAppsData((result?.structuredContent as ListAppsOutput) ?? null);
			}
		} catch {
			// silently fail
		} finally {
			setAppsLoading(false);
		}
	}, [app, userEnv, appsLoading]);

	const handleAppsToggle = () => {
		const next = !appsOpen;
		setAppsOpen(next);
		if (next && !appsData) {
			void fetchApps();
		}
	};

	const handleInstallApp = async (name: string, vendor: string) => {
		if (!app) return;
		const blockId = `${vendor}-${name}`;
		setInstallingApps((prev) => new Set(prev).add(blockId));
		try {
			await app.callServerTool({
				name: "install_app",
				arguments: { env: userEnv, app: name, vendor },
			});
			setAppsData(null);
			void fetchApps();
		} catch {
			toast.error(`Failed to install ${name}`);
		} finally {
			setInstallingApps((prev) => {
				const next = new Set(prev);
				next.delete(blockId);
				return next;
			});
		}
	};

	const handleUninstallApp = async (name: string, vendor: string) => {
		if (!app) return;
		const blockId = `${vendor}-${name}`;
		setInstallingApps((prev) => new Set(prev).add(blockId));
		try {
			await app.callServerTool({
				name: "uninstall_app",
				arguments: { env: userEnv, app: name, vendor },
			});
			setAppsData(null);
			void fetchApps();
		} catch {
			toast.error(`Failed to uninstall ${name}`);
		} finally {
			setInstallingApps((prev) => {
				const next = new Set(prev);
				next.delete(blockId);
				return next;
			});
		}
	};

	const handleOpenAppConfig = async (
		_blockId: string,
		configPath: string,
		title: string,
	) => {
		if (!app || !userEnv) return;
		setAppConfigTitle(title);
		setAppConfigData(null);
		setAppConfigSchema(null);
		setAppConfigLoading(true);
		setAppConfigModalOpen(true);
		try {
			const result = await app.callServerTool({
				name: "read_file",
				arguments: { env: userEnv, filepath: configPath },
			});
			if (!result?.isError) {
				const data = result?.structuredContent as ReadFileOutput;
				if (data?.content) {
					let parsed: Record<string, unknown> = {};
					try {
						parsed = JSON.parse(data.content) as Record<string, unknown>;
					} catch {
						parsed = { raw: data.content };
					}
					setAppConfigData(parsed);

					// Fetch schema for all declared props
					const resolveType = parsed.__resolveType as string | undefined;
					if (resolveType) {
						const schemaResult = await app.callServerTool({
							name: "get_block_schema",
							arguments: { env: userEnv, resolveType },
						});
						if (!schemaResult?.isError) {
							const schemaData = schemaResult?.structuredContent as
								| GetBlockSchemaOutput
								| undefined;
							if (
								schemaData?.properties &&
								Object.keys(schemaData.properties).length > 0
							) {
								setAppConfigSchema(schemaData.properties);
							}
						}
					}
				}
			}
		} catch {
			// silently fail
		} finally {
			setAppConfigLoading(false);
		}
	};

	// ── CMS handlers ─────────────────────────────────────────────────────────────

	const handleCmsToggle = () => {
		const next = !cmsOpen;
		setCmsOpen(next);
		if (next) {
			setViewMode("preview");
			setCmsPanelVisible(true);
		}
		if (!next) {
			setCmsData(null);
			setCmsSelectedSection(null);
			setCmsSectionData(null);
			setCmsError(undefined);
			setCmsInspectActive(false);
			setCmsInspectElement(null);
			setCmsInspectInput("");
			setCmsPanelVisible(true);
			setCmsSavedBlock(false);
			if (cmsAutoSaveTimerRef.current)
				clearTimeout(cmsAutoSaveTimerRef.current);
		}
	};

	const handleCmsPanelClose = () => {
		setCmsPanelVisible(false);
		setCmsSelectedSection(null);
		setCmsSectionData(null);
		setCmsSavedBlock(false);
	};

	const handleCmsSelectSection = (idx: number) => {
		if (!cmsData) return;
		setCmsPanelVisible(true);
		setCmsSelectedSection(idx);
		cmsSelectedSectionRef.current = idx;
		const sections = cmsData.pageData.sections as Record<string, unknown>[];
		const raw = sections[idx] ?? null;
		const displaySection = cmsData.sections[idx];

		const isSaved = displaySection?.isSavedBlock === true;
		setCmsSavedBlock(isSaved ? "readonly" : false);

		let data: Record<string, unknown> | null;
		if (isSaved && raw) {
			data = (raw as Record<string, unknown>).__resolvedData as Record<
				string,
				unknown
			> | null;
		} else if (displaySection?.isLazy && raw) {
			data =
				((raw as Record<string, unknown>).section as Record<
					string,
					unknown
				> | null) ?? raw;
		} else {
			data = raw;
		}

		setCmsSectionData(data);
		setCmsSectionSchema(null);
		setCmsSchemasMap({});

		const resolveType = isSaved
			? displaySection?.resolvedResolveType
			: displaySection?.isLazy
				? ((data as Record<string, unknown>)?.__resolveType as
						| string
						| undefined)
				: displaySection?.resolveType;

		if (!resolveType || !app || !userEnv) return;

		// Collect all __resolveType values nested inside the section data so we
		// can batch-fetch their schemas (needed for block-ref fields).
		const collectResolveTypes = (
			node: unknown,
			result: Set<string> = new Set(),
		): Set<string> => {
			if (!node || typeof node !== "object") return result;
			if (Array.isArray(node)) {
				node.forEach((item) => collectResolveTypes(item, result));
				return result;
			}
			const obj = node as Record<string, unknown>;
			if (typeof obj.__resolveType === "string") result.add(obj.__resolveType);
			for (const v of Object.values(obj)) collectResolveTypes(v, result);
			return result;
		};

		const nestedTypes = collectResolveTypes(data);
		nestedTypes.delete(resolveType); // top-level fetched separately

		const fetchSchema = (rt: string) =>
			app
				.callServerTool({
					name: "get_block_schema",
					arguments: { env: userEnv, resolveType: rt },
				})
				.then((result) => {
					if (result?.isError) return null;
					const sd = result?.structuredContent as
						| GetBlockSchemaOutput
						| undefined;
					return sd?.properties && Object.keys(sd.properties).length > 0
						? ([rt, sd.properties] as const)
						: null;
				})
				.catch(() => null);

		// Fetch top-level schema
		void fetchSchema(resolveType).then((entry) => {
			if (entry) setCmsSectionSchema(entry[1]);
		});

		// Fetch nested schemas in parallel and merge into map
		if (nestedTypes.size > 0) {
			void Promise.all([...nestedTypes].map(fetchSchema)).then((results) => {
				const map: Record<string, SchemaProperties> = {};
				for (const entry of results) {
					if (entry) map[entry[0]] = entry[1];
				}
				setCmsSchemasMap(map);
			});
		}
	};

	const handleCmsDeselectSection = () => {
		setCmsSelectedSection(null);
		cmsSelectedSectionRef.current = null;
		setCmsSectionData(null);
		setCmsSectionSchema(null);
		setCmsSchemasMap({});
		setCmsSavedBlock(false);
	};

	const handleSavedBlockEdit = () => {
		setCmsSavedBlock("editing");
	};

	const handleSavedBlockCancel = () => {
		const snap = cmsDataRef.current;
		const idx = cmsSelectedSectionRef.current;
		if (snap && idx !== null) {
			const raw = (snap.pageData.sections as Record<string, unknown>[])[idx];
			const resolved =
				(raw?.__resolvedData as Record<string, unknown> | null) ?? null;
			setCmsSectionData(resolved);
		}
		setCmsSavedBlock("readonly");
	};

	const handleSavedBlockSave = async () => {
		const snap = cmsDataRef.current;
		const idx = cmsSelectedSectionRef.current;
		if (!snap || idx === null || !app || !userEnv || !cmsSectionData) return;

		const displaySection = snap.sections[idx];
		const blockFilePath = displaySection?.savedBlockFilePath;
		if (!blockFilePath) return;

		setCmsAutoSaving(true);
		try {
			const result = await app.callServerTool({
				name: "write_file",
				arguments: {
					env: userEnv,
					filepath: blockFilePath,
					content: JSON.stringify(cmsSectionData, null, 2),
				},
			});
			if (result?.isError) throw new Error("write_file failed");

			const sections = [
				...(snap.pageData.sections as Record<string, unknown>[]),
			];
			sections[idx] = { ...sections[idx], __resolvedData: cmsSectionData };
			const updatedPageData = { ...snap.pageData, sections };
			const next = { ...snap, pageData: updatedPageData };
			setCmsData(next);
			cmsDataRef.current = next;
			setCmsSavedBlock("readonly");
			setPreviewRefreshKey((k) => k + 1);
		} catch {
			toast.error("Failed to save block");
		} finally {
			setCmsAutoSaving(false);
		}
	};

	const handleCmsSectionDataChange = (updated: Record<string, unknown>) => {
		setCmsSectionData(updated);
		if (cmsSavedBlock === "editing") return;
		setCmsAutoSaving(true);
		if (cmsAutoSaveTimerRef.current) clearTimeout(cmsAutoSaveTimerRef.current);
		cmsAutoSaveTimerRef.current = setTimeout(async () => {
			const snap = cmsDataRef.current;
			const idx = cmsSelectedSectionRef.current;
			if (!snap || idx === null || !app || !userEnv) {
				setCmsAutoSaving(false);
				return;
			}
			try {
				const sections = [...(snap.pageData.sections as unknown[])];
				const displaySection = snap.sections[idx];
				if (displaySection?.isLazy) {
					// preserve the lazy wrapper, update only the inner section
					sections[idx] = {
						...(sections[idx] as Record<string, unknown>),
						section: updated,
					};
				} else {
					sections[idx] = updated;
				}
				const updatedPageData = { ...snap.pageData, sections };
				const result = await app.callServerTool({
					name: "write_file",
					arguments: {
						env: userEnv,
						filepath: snap.filePath,
						content: JSON.stringify(updatedPageData, null, 2),
					},
				});
				if (result?.isError) throw new Error("write_file failed");
				const next = { ...snap, pageData: updatedPageData };
				setCmsData(next);
				cmsDataRef.current = next;
				setPreviewRefreshKey((k) => k + 1);
			} catch {
				toast.error("Auto-save failed");
			} finally {
				setCmsAutoSaving(false);
			}
		}, 800);
	};

	const handleCmsReorderSections = async (srcIdx: number, destIdx: number) => {
		const snap = cmsDataRef.current;
		if (!snap || !app || !userEnv) return;

		const rawSections = [...(snap.pageData.sections as unknown[])];
		const [movedRaw] = rawSections.splice(srcIdx, 1);
		rawSections.splice(destIdx, 0, movedRaw);

		const displaySections = [...snap.sections];
		const [movedDisplay] = displaySections.splice(srcIdx, 1);
		displaySections.splice(destIdx, 0, movedDisplay);
		const reindexed = displaySections.map((s, i) => ({ ...s, index: i }));

		const updatedPageData = { ...snap.pageData, sections: rawSections };
		const next: GetPageSectionsOutput = {
			...snap,
			pageData: updatedPageData,
			sections: reindexed,
		};
		setCmsData(next);
		cmsDataRef.current = next;

		try {
			const result = await app.callServerTool({
				name: "write_file",
				arguments: {
					env: userEnv,
					filepath: snap.filePath,
					content: JSON.stringify(updatedPageData, null, 2),
				},
			});
			if (result?.isError) throw new Error("write_file failed");
			setPreviewRefreshKey((k) => k + 1);
		} catch {
			toast.error("Failed to reorder sections");
			setCmsData(snap);
			cmsDataRef.current = snap;
		}
	};

	const handleCmsPageMetaChange = (name: string, path: string) => {
		if (cmsAutoSaveTimerRef.current) clearTimeout(cmsAutoSaveTimerRef.current);
		cmsAutoSaveTimerRef.current = setTimeout(async () => {
			const snap = cmsDataRef.current;
			if (!snap || !app || !userEnv) return;
			try {
				const updatedPageData = { ...snap.pageData, name, path };
				const result = await app.callServerTool({
					name: "write_file",
					arguments: {
						env: userEnv,
						filepath: snap.filePath,
						content: JSON.stringify(updatedPageData, null, 2),
					},
				});
				if (result?.isError) throw new Error("write_file failed");
				const next = { ...snap, pageData: updatedPageData };
				setCmsData(next);
				cmsDataRef.current = next;
			} catch {
				toast.error("Auto-save failed");
			}
		}, 600);
	};

	const handleCmsAddSection = async () => {
		if (!app || !userEnv) return;
		// Open the picker modal and lazily fetch available sections
		setAddSectionOpen(true);
		setAddSectionSearch("");
		if (!addSectionSections) {
			setAddSectionLoading(true);
			try {
				const result = await app.callServerTool({
					name: "list_sections",
					arguments: { env: userEnv },
				});
				if (!result?.isError) {
					setAddSectionSections(
						(result?.structuredContent as ListSectionsOutput) ?? null,
					);
				}
			} finally {
				setAddSectionLoading(false);
			}
		}
	};

	const handleCmsConfirmAddSection = async (
		resolveType: string,
		blockId?: string,
	) => {
		const snap = cmsDataRef.current;
		if (!snap || !app || !userEnv) return;
		setAddSectionOpen(false);
		// Global sections are referenced by their blockId, component sections by resolveType
		const sectionRef = blockId ?? resolveType;
		const newSection = { __resolveType: sectionRef };
		const rawSections = [...(snap.pageData.sections as unknown[]), newSection];
		const newIndex = rawSections.length - 1;
		const updatedPageData = { ...snap.pageData, sections: rawSections };
		const title =
			(blockId ?? resolveType)
				.split("/")
				.pop()
				?.replace(/\.tsx?$/, "") ?? "New section";
		const newDisplaySection = {
			index: newIndex,
			resolveType: sectionRef,
			label: title,
		};
		const next: GetPageSectionsOutput = {
			...snap,
			pageData: updatedPageData,
			sections: [...snap.sections, newDisplaySection],
		};
		setCmsData(next);
		cmsDataRef.current = next;
		try {
			const result = await app.callServerTool({
				name: "write_file",
				arguments: {
					env: userEnv,
					filepath: snap.filePath,
					content: JSON.stringify(updatedPageData, null, 2),
				},
			});
			if (result?.isError) throw new Error("write_file failed");
			setPreviewRefreshKey((k) => k + 1);
			// auto-open the new section for editing
			setCmsSelectedSection(newIndex);
			cmsSelectedSectionRef.current = newIndex;
			setCmsSectionData(newSection);
		} catch {
			toast.error("Failed to add section");
			setCmsData(snap);
			cmsDataRef.current = snap;
		}
	};

	const handleCmsDuplicateSection = async (listIdx: number) => {
		const snap = cmsDataRef.current;
		if (!snap || !app || !userEnv) return;
		const rawSections = [...(snap.pageData.sections as unknown[])];
		const copy = structuredClone(rawSections[listIdx]);
		rawSections.splice(listIdx + 1, 0, copy);
		const displaySections = [...snap.sections];
		const original = displaySections[listIdx];
		const newDisplay = {
			...original,
			index: listIdx + 1,
			label: `${original.label} (copy)`,
		};
		const reindexed = [
			...displaySections.slice(0, listIdx + 1),
			newDisplay,
			...displaySections
				.slice(listIdx + 1)
				.map((s, i) => ({ ...s, index: listIdx + 2 + i })),
		];
		const updatedPageData = { ...snap.pageData, sections: rawSections };
		const next: GetPageSectionsOutput = {
			...snap,
			pageData: updatedPageData,
			sections: reindexed,
		};
		setCmsData(next);
		cmsDataRef.current = next;
		try {
			const result = await app.callServerTool({
				name: "write_file",
				arguments: {
					env: userEnv,
					filepath: snap.filePath,
					content: JSON.stringify(updatedPageData, null, 2),
				},
			});
			if (result?.isError) throw new Error("write_file failed");
			setPreviewRefreshKey((k) => k + 1);
		} catch {
			toast.error("Failed to duplicate section");
			setCmsData(snap);
			cmsDataRef.current = snap;
		}
	};

	const handleCmsRemoveSection = async (listIdx: number) => {
		const snap = cmsDataRef.current;
		if (!snap || !app || !userEnv) return;
		const rawSections = (snap.pageData.sections as unknown[]).filter(
			(_, i) => i !== listIdx,
		);
		const reindexed = snap.sections
			.filter((_, i) => i !== listIdx)
			.map((s, i) => ({ ...s, index: i }));
		const updatedPageData = { ...snap.pageData, sections: rawSections };
		const next: GetPageSectionsOutput = {
			...snap,
			pageData: updatedPageData,
			sections: reindexed,
		};
		setCmsData(next);
		cmsDataRef.current = next;
		if (cmsSelectedSectionRef.current === listIdx) {
			setCmsSelectedSection(null);
			cmsSelectedSectionRef.current = null;
			setCmsSectionData(null);
		}
		try {
			const result = await app.callServerTool({
				name: "write_file",
				arguments: {
					env: userEnv,
					filepath: snap.filePath,
					content: JSON.stringify(updatedPageData, null, 2),
				},
			});
			if (result?.isError) throw new Error("write_file failed");
			setPreviewRefreshKey((k) => k + 1);
		} catch {
			toast.error("Failed to remove section");
			setCmsData(snap);
			cmsDataRef.current = snap;
		}
	};

	const LAZY_RESOLVE_TYPE = "website/sections/Rendering/Lazy.tsx";

	const handleCmsToggleLazySection = async (listIdx: number) => {
		const snap = cmsDataRef.current;
		if (!snap || !app || !userEnv) return;
		const rawSections = [
			...(snap.pageData.sections as Record<string, unknown>[]),
		];
		const current = rawSections[listIdx];
		const displaySection = snap.sections[listIdx];
		const isLazy = displaySection?.isLazy;

		rawSections[listIdx] = isLazy
			? // unwrap: expose inner section
				((current.section as Record<string, unknown>) ?? current)
			: // wrap: add lazy envelope
				{ __resolveType: LAZY_RESOLVE_TYPE, section: current };

		const updatedDisplaySection = {
			...displaySection,
			resolveType: isLazy
				? (((rawSections[listIdx] as Record<string, unknown>)
						.__resolveType as string) ?? "")
				: LAZY_RESOLVE_TYPE,
			isLazy: !isLazy,
		};
		const updatedDisplaySections = snap.sections.map((s, i) =>
			i === listIdx ? updatedDisplaySection : s,
		);

		const updatedPageData = { ...snap.pageData, sections: rawSections };
		const next: GetPageSectionsOutput = {
			...snap,
			pageData: updatedPageData,
			sections: updatedDisplaySections,
		};
		setCmsData(next);
		cmsDataRef.current = next;
		// clear edit state since section structure changed
		setCmsSelectedSection(null);
		cmsSelectedSectionRef.current = null;
		setCmsSectionData(null);
		try {
			const result = await app.callServerTool({
				name: "write_file",
				arguments: {
					env: userEnv,
					filepath: snap.filePath,
					content: JSON.stringify(updatedPageData, null, 2),
				},
			});
			if (result?.isError) throw new Error("write_file failed");
			setPreviewRefreshKey((k) => k + 1);
		} catch {
			toast.error("Failed to toggle lazy");
			setCmsData(snap);
			cmsDataRef.current = snap;
		}
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

	const handleCreatePage = async (event: FormEvent) => {
		event.preventDefault();
		const trimmedName = newPageName.trim();
		const trimmedPath = newPagePath.trim();
		if (!trimmedName) {
			setCreatePageError("Page name is required.");
			return;
		}
		if (!trimmedPath.startsWith("/")) {
			setCreatePageError("Path must start with /");
			return;
		}
		if (pages.some((p) => p.path === trimmedPath)) {
			setCreatePageError(`A page with path "${trimmedPath}" already exists.`);
			return;
		}
		setIsCreatingPage(true);
		setCreatePageError(undefined);
		try {
			const result = await app?.callServerTool({
				name: "create_page",
				arguments: { env: userEnv, name: trimmedName, path: trimmedPath },
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to create page",
				);
			}
			const data = result?.structuredContent as CreatePageOutput | undefined;
			setCreatePageDialogOpen(false);
			setNewPageName("My New Page");
			setNewPagePath("/example-path");
			// Navigate to the new page in preview
			if (data?.path) {
				setPreviewPathInput(data.path);
				setPreviewPath(data.path);
			}
			// Refresh the pages list
			setPagesLoaded(false);
			// Open the CMS sections panel
			setCmsOpen(true);
			toast.success(`Page "${trimmedName}" created`);
		} catch (error) {
			setCreatePageError(
				error instanceof Error ? error.message : "Failed to create page",
			);
		} finally {
			setIsCreatingPage(false);
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

	const handleCmsInspectSend = useCallback(async () => {
		if (!cmsInspectElement || !cmsInspectInput.trim() || !app) return;
		const p = cmsInspectElement;
		setIsSendingCmsInspect(true);

		try {
			const lines = [
				`The user inspected a section on the live preview and asked: **"${cmsInspectInput.trim()}"**`,
				"",
			];

			if (cmsData?.filePath) {
				lines.push(`**Page file:** \`${cmsData.filePath}\``, "");
			}

			lines.push(`**Section type:** \`${p.manifestKey}\``);
			if (cmsSelectedSection !== null) {
				lines.push(`**Section index:** ${cmsSelectedSection}`);
			}

			const sectionSourceFile = p.manifestKey.startsWith("site/")
				? p.manifestKey.replace("site/", "")
				: p.manifestKey;
			lines.push(`**Section source file:** \`${sectionSourceFile}\``, "");

			if (cmsSectionData) {
				const propsJson = JSON.stringify(cmsSectionData, null, 2);
				const truncated =
					propsJson.length > 3000
						? `${propsJson.slice(0, 3000)}\n... (truncated)`
						: propsJson;
				lines.push(
					"**Current section props (JSON):**",
					"```json",
					truncated,
					"```",
					"",
				);
			}

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
				"Please read the section source file, understand the current props, and apply the requested change. " +
					"If the change involves CMS content (text, images, settings), modify the page JSON at the correct section index. " +
					"If the change involves code or styling, modify the section source file.",
			);

			app.sendMessage({
				role: "user",
				content: [{ type: "text", text: lines.join("\n") }],
			});

			setCmsInspectElement(null);
			setCmsInspectInput("");
		} finally {
			setIsSendingCmsInspect(false);
		}
	}, [
		app,
		cmsInspectElement,
		cmsInspectInput,
		cmsData,
		cmsSelectedSection,
		cmsSectionData,
		site,
		userEnv,
	]);

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
								{!cmsOpen && (
									<>
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
									</>
								)}
								{(cmsOpen ||
									viewMode === "preview" ||
									viewMode === "visual") && (
									<button
										type="button"
										className={cn(
											"flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors",
											cmsOpen
												? "bg-primary/10 text-primary"
												: "bg-muted/40 text-muted-foreground hover:text-foreground",
										)}
										onClick={handleCmsToggle}
										disabled={envStatus !== "ready"}
										title="CMS — browse and edit page sections"
									>
										<LayersIcon className="h-3.5 w-3.5" />
									</button>
								)}
								{cmsOpen && (
									<button
										type="button"
										className={cn(
											"flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors",
											cmsInspectActive
												? "bg-primary/10 text-primary"
												: "text-muted-foreground hover:text-foreground",
										)}
										onClick={() => setCmsInspectActive((v) => !v)}
										disabled={envStatus !== "ready"}
										title="Inspect — click sections in the preview to edit"
									>
										<Crosshair className="h-3.5 w-3.5" />
									</button>
								)}
								{cmsOpen && (
									<button
										type="button"
										className={cn(
											"flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors",
											cmsPanelVisible
												? "bg-primary/10 text-primary"
												: "text-muted-foreground hover:text-foreground",
										)}
										onClick={() => setCmsPanelVisible((v) => !v)}
										disabled={envStatus !== "ready"}
										title="Toggle CMS form panel"
									>
										<PanelLeft className="h-3.5 w-3.5" />
									</button>
								)}
								{/* More options */}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className={cn(
												"flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
												appsOpen
													? "bg-background text-foreground shadow-xs"
													: "text-muted-foreground hover:text-foreground",
											)}
											title="More options"
										>
											<MoreHorizontal className="h-3.5 w-3.5" />
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="w-44">
										<DropdownMenuItem
											className="cursor-pointer"
											onSelect={handleAppsToggle}
										>
											<Package className="mr-2 h-4 w-4" />
											Apps
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
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
										<div className="p-1 border-b">
											<button
												type="button"
												className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
												onMouseDown={(e) => {
													e.preventDefault();
													setPagesOpen(false);
													setCreatePageDialogOpen(true);
												}}
											>
												<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
												<span className="flex-1 font-medium">
													Create new page
												</span>
											</button>
										</div>
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

														{/* CMS panel */}
														{cmsOpen && cmsPanelVisible && (
															<CmsPanel
																loading={cmsLoading}
																error={cmsError}
																data={cmsData}
																selectedSection={cmsSelectedSection}
																sectionData={cmsSectionData}
																sectionSchema={cmsSectionSchema}
																schemasMap={cmsSchemasMap}
																autoSaving={cmsAutoSaving}
																savedBlock={cmsSavedBlock}
																onSelectSection={handleCmsSelectSection}
																onDeselectSection={handleCmsDeselectSection}
																onChangeSectionData={handleCmsSectionDataChange}
																onReorderSections={(src, dest) =>
																	void handleCmsReorderSections(src, dest)
																}
																onDuplicateSection={(idx) =>
																	void handleCmsDuplicateSection(idx)
																}
																onRemoveSection={(idx) =>
																	void handleCmsRemoveSection(idx)
																}
																onToggleLazySection={(idx) =>
																	void handleCmsToggleLazySection(idx)
																}
																onPageMetaChange={handleCmsPageMetaChange}
																onAddSection={() => void handleCmsAddSection()}
																onClose={handleCmsPanelClose}
																onSavedBlockEdit={handleSavedBlockEdit}
																onSavedBlockCancel={handleSavedBlockCancel}
																onSavedBlockSave={() =>
																	void handleSavedBlockSave()
																}
															/>
														)}

														{/* Apps panel */}
														{appsOpen && (
															<AppsPanel
																loading={appsLoading}
																data={appsData}
																installingApps={installingApps}
																onClose={handleAppsToggle}
																onSelectApp={(blockId, configPath, title) =>
																	void handleOpenAppConfig(
																		blockId,
																		configPath,
																		title,
																	)
																}
																onInstall={(name, vendor) =>
																	void handleInstallApp(name, vendor)
																}
																onUninstall={(name, vendor) =>
																	void handleUninstallApp(name, vendor)
																}
															/>
														)}

														{/* Add section modal */}
														<Dialog
															open={addSectionOpen}
															onOpenChange={setAddSectionOpen}
														>
															<DialogContent className="flex max-h-[80vh] w-[1000px] flex-col gap-0 p-0">
																<DialogHeader className="shrink-0 border-b px-4 py-3">
																	<span className="text-sm font-semibold">
																		Add section
																	</span>
																</DialogHeader>
																<div className="shrink-0 border-b px-3 py-2">
																	<Input
																		autoFocus
																		placeholder="Search sections…"
																		className="h-7 text-xs"
																		value={addSectionSearch}
																		onChange={(e) =>
																			setAddSectionSearch(e.target.value)
																		}
																	/>
																</div>
																<div className="min-h-0 flex-1 overflow-y-auto p-3">
																	{addSectionLoading ? (
																		<div className="flex items-center justify-center py-10">
																			<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
																		</div>
																	) : (
																		(() => {
																			const q = addSectionSearch.toLowerCase();
																			const filtered = (
																				addSectionSections?.sections ?? []
																			).filter(
																				(s) =>
																					!q ||
																					s.title.toLowerCase().includes(q) ||
																					s.resolveType
																						.toLowerCase()
																						.includes(q),
																			);
																			const globals = filtered.filter(
																				(s) => s.isGlobal,
																			);
																			const types = filtered.filter(
																				(s) => !s.isGlobal,
																			);

																			if (filtered.length === 0) {
																				return (
																					<div className="py-8 text-center text-xs text-muted-foreground">
																						No sections found
																					</div>
																				);
																			}

																			const SectionCard = (
																				s: (typeof filtered)[0],
																			) => (
																				<button
																					key={s.blockId ?? s.resolveType}
																					type="button"
																					onClick={() =>
																						void handleCmsConfirmAddSection(
																							s.resolveType,
																							s.blockId,
																						)
																					}
																					className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
																				>
																					{/* Preview iframe */}
																					<div className="relative h-32 w-full overflow-hidden bg-muted/30">
																						{s.previewUrl ? (
																							<iframe
																								src={s.previewUrl}
																								loading="lazy"
																								scrolling="no"
																								className="pointer-events-none absolute left-0 top-0 origin-top-left border-none"
																								style={{
																									width: "1280px",
																									height: "640px",
																									transform: "scale(0.234)",
																									transformOrigin: "top left",
																								}}
																								title={s.title}
																							/>
																						) : (
																							<div className="flex h-full items-center justify-center">
																								<span className="text-xs text-muted-foreground">
																									No preview
																								</span>
																							</div>
																						)}
																						{s.isGlobal && (
																							<div className="absolute right-1.5 top-1.5 rounded-full bg-primary/90 px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
																								Global
																							</div>
																						)}
																					</div>
																					{/* Info */}
																					<div className="flex flex-col gap-0.5 px-2.5 py-2">
																						<span className="truncate text-xs font-medium text-foreground group-hover:text-primary">
																							{s.title}
																						</span>
																						{s.description && (
																							<span className="line-clamp-1 text-[10px] text-muted-foreground">
																								{s.description}
																							</span>
																						)}
																					</div>
																				</button>
																			);

																			return (
																				<div className="space-y-4">
																					{globals.length > 0 && (
																						<div className="space-y-2">
																							<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
																								Global sections
																							</p>
																							<div className="grid grid-cols-3 gap-2">
																								{globals.map(SectionCard)}
																							</div>
																						</div>
																					)}
																					{types.length > 0 && (
																						<div className="space-y-2">
																							{globals.length > 0 && (
																								<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
																									Sections
																								</p>
																							)}
																							<div className="grid grid-cols-3 gap-2">
																								{types.map(SectionCard)}
																							</div>
																						</div>
																					)}
																				</div>
																			);
																		})()
																	)}
																</div>
															</DialogContent>
														</Dialog>

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

														{cmsOpen &&
															cmsInspectActive &&
															previewUrl &&
															!cmsInspectElement && (
																<div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/90 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm pointer-events-none select-none">
																	<Crosshair className="h-3 w-3" />
																	Click any section to inspect
																</div>
															)}

														{cmsOpen &&
															cmsInspectActive &&
															cmsInspectElement &&
															(() => {
																const POPUP_W = 320;
																const POPUP_H = 44;
																const PAD = 12;
																const { x, y } = cmsInspectElement.position;
																const { width: vw, height: vh } =
																	cmsInspectElement.viewport;
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
																				void handleCmsInspectSend();
																			}}
																		>
																			<input
																				ref={cmsInspectInputRef}
																				type="text"
																				value={cmsInspectInput}
																				onChange={(e) =>
																					setCmsInspectInput(e.target.value)
																				}
																				onKeyDown={(e) => {
																					if (e.key === "Escape") {
																						setCmsInspectElement(null);
																						setCmsInspectInput("");
																					}
																				}}
																				placeholder="Ask the AI about this section..."
																				className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
																			/>
																			<button
																				type="submit"
																				disabled={
																					!cmsInspectInput.trim() ||
																					isSendingCmsInspect
																				}
																				className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
																				title="Send"
																			>
																				{isSendingCmsInspect ? (
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
																	const win =
																		previewIframeRef.current?.contentWindow;
																	if (!win) return;

																	const scriptToInject =
																		cmsOpen && cmsInspectActive
																			? cmsInspectScript
																			: viewMode === "visual"
																				? visualEditorScript
																				: null;

																	if (!scriptToInject) return;

																	try {
																		const script =
																			win.document.createElement("script");
																		script.textContent = `(${scriptToInject.toString()})()`;
																		win.document.head.appendChild(script);
																	} catch {
																		win.postMessage(
																			{
																				type: "editor::inject",
																				args: {
																					script: `(${scriptToInject.toString()})()`,
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

			{/* ── create page dialog ── */}
			<Dialog
				open={createPageDialogOpen}
				onOpenChange={(open) => {
					if (!isCreatingPage) {
						setCreatePageDialogOpen(open);
						if (!open) setCreatePageError(undefined);
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="text-base">Create new page</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleCreatePage} className="space-y-4">
						<div className="space-y-1.5">
							<label
								htmlFor="new-page-name"
								className="text-xs font-medium text-muted-foreground"
							>
								Name
							</label>
							<Input
								id="new-page-name"
								value={newPageName}
								onChange={(e) => setNewPageName(e.target.value)}
								placeholder="My New Page"
								autoFocus
								disabled={isCreatingPage}
							/>
						</div>
						<div className="space-y-1.5">
							<label
								htmlFor="new-page-path"
								className="text-xs font-medium text-muted-foreground"
							>
								Path
							</label>
							<Input
								id="new-page-path"
								value={newPagePath}
								onChange={(e) => setNewPagePath(e.target.value)}
								placeholder="/example-path"
								disabled={isCreatingPage}
							/>
						</div>
						{createPageError && (
							<p className="text-xs text-destructive">{createPageError}</p>
						)}
						<DialogFooter>
							<Button
								type="submit"
								size="sm"
								className="gap-1.5"
								disabled={
									!newPageName.trim() || !newPagePath.trim() || isCreatingPage
								}
							>
								{isCreatingPage && (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								)}
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

			{/* ── app config modal ── */}
			<Dialog
				open={appConfigModalOpen}
				onOpenChange={(open) => {
					setAppConfigModalOpen(open);
					if (!open) {
						setAppConfigData(null);
						setAppConfigSchema(null);
						setAppConfigTitle("");
					}
				}}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Package className="h-4 w-4 text-muted-foreground" />
							{appConfigTitle}
						</DialogTitle>
					</DialogHeader>
					{appConfigLoading ? (
						<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span className="text-sm">Loading configuration…</span>
						</div>
					) : !appConfigData ? (
						<div className="py-6 text-center text-sm text-muted-foreground">
							No configuration found for this app.
						</div>
					) : (
						<ScrollArea className="max-h-[60vh]">
							<SectionForm
								data={appConfigData}
								schema={appConfigSchema ?? undefined}
								onChange={(data) => setAppConfigData(data)}
							/>
						</ScrollArea>
					)}
				</DialogContent>
			</Dialog>
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
