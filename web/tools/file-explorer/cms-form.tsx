import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Code2,
	GripVertical,
	FileIcon,
	ImageIcon,
	Link,
	Loader2,
	VideoIcon,
	MoreHorizontal,
	Plus,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select.tsx";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useMcpApp } from "@/context.tsx";
import type {
	Asset,
	AssetsOutput,
	UploadAssetOutput,
} from "../../../api/tools/assets.ts";
import type { SchemaProperty } from "../../../api/tools/files.ts";

// ─── types ────────────────────────────────────────────────────────────────────

export type SchemaProperties = Record<string, SchemaProperty>;

export type FormValue =
	| string
	| number
	| boolean
	| FormValue[]
	| { [key: string]: FormValue }
	| null
	| undefined;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Stop adding left-margin indent after this many levels to prevent truncation in narrow panels. */
const MAX_INDENT_DEPTH = 3;

function nestClass(depth: number): string {
	return depth < MAX_INDENT_DEPTH ? "ml-3 border-l pl-3" : "border-l pl-2";
}

function humanize(key: string): string {
	return key
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (s) => s.toUpperCase())
		.trim();
}

function isImageField(name: string, value: unknown): boolean {
	if (typeof value !== "string") return false;
	const n = name.toLowerCase();
	if (
		n.includes("image") ||
		n.includes("img") ||
		n.includes("photo") ||
		n.includes("poster") ||
		n.includes("logo") ||
		n.includes("banner") ||
		n.includes("thumbnail") ||
		n.includes("cover") ||
		n.includes("avatar") ||
		n.includes("picture") ||
		n.includes("desktop") ||
		n.includes("mobile")
	)
		return true;
	return /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(value);
}

/** Return the empty/zero value appropriate for a given schema type. */
function defaultForSchemaType(
	type: string | undefined,
	schemaDefault: unknown,
): FormValue {
	if (schemaDefault !== undefined) return schemaDefault as FormValue;
	switch (type) {
		case "number":
		case "integer":
			return 0;
		case "boolean":
			return false;
		case "array":
			return [];
		case "object":
			return {};
		default:
			return "";
	}
}

// ─── field label ──────────────────────────────────────────────────────────────

function FieldLabel({
	label,
	description,
}: {
	label: string;
	description?: string;
}) {
	if (!label) return null;
	return (
		<div className="min-w-0 space-y-0.5">
			<span className="block truncate text-xs font-medium text-muted-foreground">
				{label}
			</span>
			{description && (
				<span className="block text-[10px] leading-snug text-muted-foreground/70">
					{description}
				</span>
			)}
		</div>
	);
}

// ─── text field ───────────────────────────────────────────────────────────────

function TextField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-7 text-xs"
			/>
		</div>
	);
}

// ─── textarea field ──────────────────────────────────────────────────────────

function TextareaField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<Textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={5}
				className="min-h-[unset] text-xs"
			/>
		</div>
	);
}

// ─── color input field ───────────────────────────────────────────────────────

function ColorInputField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const [color, setColor] = useState(value || "#000000");

	useEffect(() => {
		setColor(value || "#000000");
	}, [value]);

	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<label className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
				<style>
					{`input[type="color"].cms-color-swatch{-webkit-appearance:none;border:none;width:18px;height:18px;border-radius:999px;padding:0;cursor:pointer}
input[type="color"].cms-color-swatch::-webkit-color-swatch-wrapper{padding:0}
input[type="color"].cms-color-swatch::-webkit-color-swatch{border:1px solid oklch(0.7 0 0 / 0.25);border-radius:999px}`}
				</style>
				<input
					type="color"
					className="cms-color-swatch outline-1 outline outline-border"
					value={color}
					onChange={(e) => {
						setColor(e.target.value);
						onChange(e.target.value);
					}}
				/>
				<input
					type="text"
					className="min-w-0 flex-1 bg-transparent uppercase outline-none"
					value={color}
					onChange={(e) => {
						setColor(e.target.value);
						onChange(e.target.value);
					}}
				/>
			</label>
		</div>
	);
}

// ─── date / datetime field ───────────────────────────────────────────────────

function formatForNativeInput(
	dateStr: string | undefined,
	mode: "date" | "date-time",
): string {
	if (!dateStr) return "";
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return dateStr;
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	if (mode === "date") return `${y}-${m}-${d}`;
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${d}T${hh}:${mm}`;
}

function DateField({
	label,
	description,
	value,
	onChange,
	mode = "date",
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
	mode?: "date" | "date-time";
}) {
	const inputType = mode === "date" ? "date" : "datetime-local";
	const inputRef = useRef<HTMLInputElement>(null);
	const [local, setLocal] = useState(() => formatForNativeInput(value, mode));

	// Sync external value changes, but only if the formatted value actually
	// differs from what we already have — avoids re-renders that kill the
	// native date picker popup.
	const prevFormattedRef = useRef(local);
	useEffect(() => {
		const formatted = formatForNativeInput(value, mode);
		if (formatted !== prevFormattedRef.current) {
			prevFormattedRef.current = formatted;
			setLocal(formatted);
		}
	}, [value, mode]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value;
		setLocal(raw);
		prevFormattedRef.current = raw;
		if (!raw) {
			onChange("");
			return;
		}
		if (mode === "date") {
			onChange(raw);
		} else {
			const parsed = new Date(raw);
			if (!Number.isNaN(parsed.getTime())) {
				onChange(parsed.toISOString());
			}
		}
	};

	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<div className="relative flex items-center">
				<input
					ref={inputRef}
					type={inputType}
					value={local}
					onChange={handleChange}
					className="flex h-7 w-full rounded-md border border-input bg-transparent px-2 pr-7 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]{opacity:0;width:0}"
				/>
				<button
					type="button"
					onClick={() => inputRef.current?.showPicker()}
					className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
					title="Open picker"
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden="true"
					>
						<title>Calendar</title>
						<rect
							x="1"
							y="3"
							width="14"
							height="12"
							rx="2"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
						<path d="M1 7h14" stroke="currentColor" strokeWidth="1.5" />
						<path
							d="M5 1v4M11 1v4"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}

// ─── code field ──────────────────────────────────────────────────────────────

function CodeField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<div className="relative overflow-hidden rounded-md border border-input">
				<div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1">
					<Code2 className="h-3 w-3 text-muted-foreground" />
					<span className="text-[10px] text-muted-foreground">Code</span>
				</div>
				<textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					rows={10}
					spellCheck={false}
					className="w-full resize-y bg-muted/10 px-3 py-2 font-mono text-xs leading-relaxed outline-none"
				/>
			</div>
		</div>
	);
}

// ─── rich text field (TipTap) ────────────────────────────────────────────────

const TIPTAP_CONTENT_CSS = `
.cms-tiptap {
	min-height: 120px;
	padding: 8px 12px;
	font-size: 13px;
	line-height: 1.6;
	outline: none;
}
.cms-tiptap p { margin: 0 0 0.5em; }
.cms-tiptap h1 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
.cms-tiptap h2 { font-size: 1.3em; font-weight: 700; margin: 0.5em 0 0.3em; }
.cms-tiptap h3 { font-size: 1.1em; font-weight: 600; margin: 0.4em 0 0.2em; }
.cms-tiptap ul, .cms-tiptap ol { padding-left: 1.4em; margin: 0.3em 0; }
.cms-tiptap li { margin: 0.15em 0; }
.cms-tiptap ul { list-style: disc; }
.cms-tiptap ol { list-style: decimal; }
.cms-tiptap blockquote { border-left: 3px solid oklch(0.7 0 0 / 0.25); padding-left: 0.8em; margin: 0.4em 0; color: oklch(0.55 0 0); }
.cms-tiptap code { background: oklch(0.92 0 0); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
.cms-tiptap pre { background: oklch(0.15 0 0); color: oklch(0.9 0 0); padding: 0.6em 0.8em; border-radius: 6px; overflow-x: auto; margin: 0.4em 0; }
.cms-tiptap pre code { background: none; padding: 0; }
.cms-tiptap a { color: oklch(0.55 0.2 250); text-decoration: underline; }
.cms-tiptap img { max-width: 100%; border-radius: 4px; margin: 0.3em 0; }
.cms-tiptap hr { border: none; border-top: 1px solid oklch(0.7 0 0 / 0.25); margin: 0.8em 0; }
.cms-tiptap p[style*="text-align: center"] { text-align: center; }
.cms-tiptap p[style*="text-align: right"] { text-align: right; }
.cms-tiptap-inline { min-height: 40px; padding: 6px 10px; font-size: 13px; line-height: 1.5; outline: none; }
.cms-tiptap-inline p { margin: 0; }
.cms-tiptap-inline a { color: oklch(0.55 0.2 250); text-decoration: underline; }
`;

let tiptapCssInjected = false;
function ensureTiptapCss() {
	if (tiptapCssInjected) return;
	tiptapCssInjected = true;
	const style = document.createElement("style");
	style.textContent = TIPTAP_CONTENT_CSS;
	document.head.appendChild(style);
}

function RichTextField({
	label,
	description,
	value,
	onChange,
	inline = false,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
	inline?: boolean;
}) {
	const [editorMod, setEditorMod] = useState<{
		useEditor: typeof import("@tiptap/react").useEditor;
		EditorContent: typeof import("@tiptap/react").EditorContent;
	} | null>(null);

	useEffect(() => {
		ensureTiptapCss();
		let cancelled = false;
		Promise.all([
			import("@tiptap/react"),
			import("@tiptap/starter-kit"),
			import("@tiptap/extension-link"),
			import("@tiptap/extension-underline"),
			...(inline
				? []
				: [
						import("@tiptap/extension-image"),
						import("@tiptap/extension-text-align"),
					]),
		]).then((mods) => {
			if (cancelled) return;
			const [react, starterKit, link, underline, image, textAlign] = mods;

			const extensions = inline
				? [
						starterKit.default.configure({
							heading: false,
							blockquote: false,
							codeBlock: false,
							horizontalRule: false,
							bulletList: false,
							orderedList: false,
						}),
						link.default.configure({ openOnClick: false }),
						underline.default,
					]
				: [
						starterKit.default,
						link.default.configure({ openOnClick: false }),
						underline.default,
						(
							image as {
								default: {
									configure: (opts: Record<string, unknown>) => unknown;
								};
							}
						).default.configure({ inline: true }),
						(
							textAlign as {
								default: {
									configure: (opts: Record<string, unknown>) => unknown;
								};
							}
						).default.configure({
							types: ["heading", "paragraph"],
						}),
					];

			setEditorMod({
				useEditor: react.useEditor,
				EditorContent: react.EditorContent,
				_extensions: extensions,
			} as unknown as typeof editorMod);
		});
		return () => {
			cancelled = true;
		};
	}, [inline]);

	if (!editorMod) {
		return (
			<div className="space-y-1">
				<FieldLabel label={label} description={description} />
				<div className="flex h-20 items-center justify-center rounded-md border text-xs text-muted-foreground">
					<Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
					Loading editor…
				</div>
			</div>
		);
	}

	return (
		<RichTextFieldInner
			label={label}
			description={description}
			value={value}
			onChange={onChange}
			inline={inline}
			editorMod={editorMod}
		/>
	);
}

function RichTextFieldInner({
	label,
	description,
	value,
	onChange,
	inline,
	editorMod,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
	inline: boolean;
	editorMod: Record<string, unknown>;
}) {
	const { useEditor, EditorContent, _extensions } = editorMod as {
		useEditor: typeof import("@tiptap/react").useEditor;
		EditorContent: typeof import("@tiptap/react").EditorContent;
		_extensions: unknown[];
	};

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const editor = useEditor({
		extensions: _extensions as import("@tiptap/core").Extension[],
		content: value,
		editorProps: {
			attributes: { class: inline ? "cms-tiptap-inline" : "cms-tiptap" },
		},
		onUpdate: ({ editor: e }) => {
			onChangeRef.current(e.getHTML());
		},
	});

	// Sync external value changes
	useEffect(() => {
		if (editor && !editor.isFocused && value !== editor.getHTML()) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	}, [value, editor]);

	if (!editor) return null;

	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<div className="overflow-hidden rounded-md border border-input">
				{/* Toolbar */}
				<div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
					{!inline && (
						<>
							<TiptapBtn
								active={editor.isActive("heading", { level: 1 })}
								onClick={() =>
									editor.chain().focus().toggleHeading({ level: 1 }).run()
								}
								title="Heading 1"
							>
								H1
							</TiptapBtn>
							<TiptapBtn
								active={editor.isActive("heading", { level: 2 })}
								onClick={() =>
									editor.chain().focus().toggleHeading({ level: 2 }).run()
								}
								title="Heading 2"
							>
								H2
							</TiptapBtn>
							<TiptapBtn
								active={editor.isActive("heading", { level: 3 })}
								onClick={() =>
									editor.chain().focus().toggleHeading({ level: 3 }).run()
								}
								title="Heading 3"
							>
								H3
							</TiptapBtn>
							<TiptapSep />
						</>
					)}
					<TiptapBtn
						active={editor.isActive("bold")}
						onClick={() => editor.chain().focus().toggleBold().run()}
						title="Bold"
					>
						<span className="font-bold">B</span>
					</TiptapBtn>
					<TiptapBtn
						active={editor.isActive("italic")}
						onClick={() => editor.chain().focus().toggleItalic().run()}
						title="Italic"
					>
						<span className="italic">I</span>
					</TiptapBtn>
					<TiptapBtn
						active={editor.isActive("underline")}
						onClick={() =>
							(
								editor.chain().focus() as unknown as {
									toggleUnderline: () => { run: () => void };
								}
							)
								.toggleUnderline()
								.run()
						}
						title="Underline"
					>
						<span className="underline">U</span>
					</TiptapBtn>
					<TiptapBtn
						active={editor.isActive("strike")}
						onClick={() => editor.chain().focus().toggleStrike().run()}
						title="Strikethrough"
					>
						<span className="line-through">S</span>
					</TiptapBtn>
					<TiptapSep />
					<TiptapBtn
						active={editor.isActive("link")}
						onClick={() => {
							if (editor.isActive("link")) {
								(
									editor.chain().focus() as unknown as {
										unsetLink: () => { run: () => void };
									}
								)
									.unsetLink()
									.run();
							} else {
								const url = prompt("URL:");
								if (url) {
									(
										editor.chain().focus() as unknown as {
											setLink: (opts: { href: string }) => { run: () => void };
										}
									)
										.setLink({ href: url })
										.run();
								}
							}
						}}
						title="Link"
					>
						<Link className="h-3 w-3" />
					</TiptapBtn>
					{!inline && (
						<>
							<TiptapSep />
							<TiptapBtn
								active={editor.isActive("bulletList")}
								onClick={() => editor.chain().focus().toggleBulletList().run()}
								title="Bullet list"
							>
								•≡
							</TiptapBtn>
							<TiptapBtn
								active={editor.isActive("orderedList")}
								onClick={() => editor.chain().focus().toggleOrderedList().run()}
								title="Ordered list"
							>
								1.
							</TiptapBtn>
							<TiptapBtn
								active={editor.isActive("blockquote")}
								onClick={() => editor.chain().focus().toggleBlockquote().run()}
								title="Blockquote"
							>
								❝
							</TiptapBtn>
							<TiptapBtn
								active={editor.isActive("codeBlock")}
								onClick={() => editor.chain().focus().toggleCodeBlock().run()}
								title="Code block"
							>
								{"</>"}
							</TiptapBtn>
						</>
					)}
				</div>
				<EditorContent editor={editor} />
			</div>
		</div>
	);
}

function TiptapBtn({
	active,
	onClick,
	title,
	children,
}: {
	active: boolean;
	onClick: () => void;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={cn(
				"flex h-6 min-w-[24px] items-center justify-center rounded px-1 text-[11px] transition-colors",
				active
					? "bg-primary/15 text-primary"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function TiptapSep() {
	return <div className="mx-0.5 h-4 w-px bg-border" />;
}

// ─── number field ─────────────────────────────────────────────────────────────

function NumberField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<Input
				type="number"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="h-7 text-xs"
			/>
		</div>
	);
}

// ─── checkbox field ───────────────────────────────────────────────────────────

function CheckboxField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="space-y-0.5">
			<label className="flex cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					checked={value}
					onChange={(e) => onChange(e.target.checked)}
					className="h-3.5 w-3.5 rounded accent-primary"
				/>
				<span className="text-xs text-foreground/80">{label}</span>
			</label>
			{description && (
				<span className="block text-[10px] text-muted-foreground/70 pl-5">
					{description}
				</span>
			)}
		</div>
	);
}

// ─── image picker modal ────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type PickerTab = "assets" | "link";

function ImagePickerModal({
	open,
	onClose,
	onSelect,
}: {
	open: boolean;
	onClose: () => void;
	onSelect: (url: string) => void;
}) {
	const app = useMcpApp();
	const [tab, setTab] = useState<PickerTab>("assets");
	const [assets, setAssets] = useState<Asset[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(false);
	const [selected, setSelected] = useState<Asset | null>(null);
	const [uploading, setUploading] = useState(false);
	const [linkUrl, setLinkUrl] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const fetchAssets = useCallback(
		async (term: string, offset: number) => {
			if (!app) return;
			setLoading(true);
			try {
				const result = await app.callServerTool({
					name: "fetch_assets",
					arguments: {
						...(term ? { term } : {}),
						offset,
						limit: PAGE_SIZE,
					},
				});
				const data = result?.structuredContent as AssetsOutput | undefined;
				setAssets(data?.assets ?? []);
				setHasMore((data?.assets?.length ?? 0) >= PAGE_SIZE);
			} catch {
				setAssets([]);
			} finally {
				setLoading(false);
			}
		},
		[app],
	);

	useEffect(() => {
		if (!open) return;
		setSelected(null);
		fetchAssets(search, (page - 1) * PAGE_SIZE);
	}, [open, search, page, fetchAssets]);

	const handleUpload = async (file: File) => {
		if (!app || uploading) return;
		setUploading(true);
		try {
			const base64 = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.readAsDataURL(file);
				reader.onload = () =>
					resolve((reader.result as string).split(",")[1] ?? "");
				reader.onerror = reject;
			});
			const result = await app.callServerTool({
				name: "upload_asset",
				arguments: { data: base64, mimeType: file.type, filename: file.name },
			});
			const uploaded = result?.structuredContent as
				| UploadAssetOutput
				| undefined;
			await fetchAssets(search, 0);
			setPage(1);
			if (uploaded?.asset) setSelected(uploaded.asset);
		} finally {
			setUploading(false);
		}
	};

	const canUse =
		tab === "assets" ? selected !== null : linkUrl.trim().length > 0;

	const handleUse = () => {
		if (tab === "assets" && selected) {
			onSelect(selected.publicUrl);
		} else if (tab === "link" && linkUrl.trim()) {
			onSelect(linkUrl.trim());
		}
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex h-[640px] max-w-3xl flex-col gap-0 p-0">
				<DialogHeader className="border-b px-6 py-4">
					<DialogTitle>Add image</DialogTitle>
				</DialogHeader>

				{/* tabs */}
				<div className="flex gap-6 border-b px-6">
					{(["assets", "link"] as PickerTab[]).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={cn(
								"py-2.5 text-sm capitalize transition-colors",
								tab === t
									? "border-b-2 border-foreground font-medium"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t === "assets" ? "Assets" : "Embed Link"}
						</button>
					))}
				</div>

				{/* content */}
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-4">
					{tab === "assets" ? (
						<>
							{/* search + upload */}
							<div className="flex gap-2">
								<div className="relative flex-1">
									<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
									<Input
										className="pl-8 h-8 text-sm"
										placeholder="Search assets"
										value={search}
										onChange={(e) => {
											setSearch(e.target.value);
											setPage(1);
										}}
									/>
								</div>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*,video/*"
									className="hidden"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) handleUpload(file);
										e.target.value = "";
									}}
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
									disabled={uploading}
								>
									{uploading ? (
										<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
									) : (
										<Upload className="mr-1.5 h-3.5 w-3.5" />
									)}
									Upload file
								</Button>
							</div>

							{/* grid */}
							<div className="min-h-0 flex-1 overflow-y-auto">
								{loading ? (
									<div className="flex h-48 items-center justify-center">
										<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
									</div>
								) : assets.length === 0 ? (
									<div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
										<ImageIcon className="h-8 w-8" />
										<p className="text-sm">No assets found</p>
									</div>
								) : (
									<div className="grid grid-cols-4 gap-2 pr-1">
										{assets.map((asset) => (
											<button
												key={asset.id}
												type="button"
												onClick={() =>
													setSelected((prev) =>
														prev?.id === asset.id ? null : asset,
													)
												}
												className={cn(
													"group relative flex flex-col overflow-hidden rounded-md border bg-muted/30 transition-all",
													selected?.id === asset.id
														? "ring-2 ring-primary ring-offset-1"
														: "hover:border-muted-foreground/40",
												)}
											>
												{asset.mime?.startsWith("video/") ? (
													<div className="flex h-24 items-center justify-center bg-muted">
														<span className="text-xs text-muted-foreground">
															Video
														</span>
													</div>
												) : (
													<img
														src={asset.publicUrl}
														alt={asset.label ?? ""}
														className="h-24 w-full object-cover"
														onError={(e) => {
															(e.target as HTMLImageElement).style.display =
																"none";
														}}
													/>
												)}
												<p className="truncate px-1.5 py-1 text-left text-[10px] text-muted-foreground">
													{asset.label ?? asset.path.split("/").pop()}
												</p>
											</button>
										))}
									</div>
								)}
							</div>

							{/* pagination */}
							<div className="flex items-center justify-center gap-3 border-t pt-2">
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7"
									disabled={page === 1}
									onClick={() => setPage((p) => p - 1)}
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<span className="text-xs text-muted-foreground">
									Page {page}
								</span>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7"
									disabled={!hasMore}
									onClick={() => setPage((p) => p + 1)}
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</>
					) : (
						<div className="flex flex-col gap-3">
							<div className="relative">
								<Link className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-8 h-8 text-sm"
									placeholder="Paste image URL…"
									value={linkUrl}
									onChange={(e) => setLinkUrl(e.target.value)}
									autoFocus
								/>
							</div>
							{linkUrl.trim() ? (
								<div className="flex items-center justify-center overflow-hidden rounded-md border bg-muted/30">
									<img
										src={linkUrl}
										alt="preview"
										className="max-h-64 w-full object-contain"
									/>
								</div>
							) : (
								<div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-muted-foreground">
									<ImageIcon className="h-8 w-8" />
									<p className="text-sm">Paste an image link above</p>
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter className="border-t px-6 py-3">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={!canUse} onClick={handleUse}>
						Use file
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── image field ──────────────────────────────────────────────────────────────

function ImageField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [imgError, setImgError] = useState(false);

	const filename = value
		? (() => {
				try {
					return decodeURIComponent(
						new URL(value).pathname.split("/").pop() ?? value,
					);
				} catch {
					return value.split("/").pop() ?? value;
				}
			})()
		: "";
	const ext = filename.includes(".")
		? filename.split(".").pop()?.toUpperCase()
		: undefined;
	const stem = ext ? filename.slice(0, filename.lastIndexOf(".")) : filename;

	return (
		<div className="space-y-1.5">
			<FieldLabel label={label} description={description} />
			<div className="overflow-hidden rounded-lg border bg-muted/20">
				{/* clickable preview area */}
				<button
					type="button"
					className="w-full text-left"
					onClick={() => setOpen(true)}
				>
					{value && !imgError ? (
						<img
							src={value}
							alt={label}
							className="h-40 w-full object-cover"
							onError={() => setImgError(true)}
						/>
					) : (
						<div className="flex h-40 flex-col items-center justify-center gap-1.5 text-muted-foreground">
							<ImageIcon className="h-8 w-8" />
							<span className="text-xs">Click to select image</span>
						</div>
					)}
					{value && (
						<div className="px-3 py-2">
							<p className="truncate font-mono text-xs font-semibold">{stem}</p>
							{ext && (
								<p className="text-[10px] uppercase text-muted-foreground">
									{ext}
								</p>
							)}
						</div>
					)}
				</button>

				{/* controls */}
				<div className="flex gap-2 border-t px-2 py-2">
					<Button
						variant="outline"
						size="sm"
						className="h-8 flex-1 text-xs"
						onClick={() => setOpen(true)}
					>
						{value ? (
							<>
								Change <ChevronDown className="ml-1 h-3 w-3" />
							</>
						) : (
							<>
								<ImageIcon className="mr-1 h-3 w-3" /> Add image
							</>
						)}
					</Button>
					{value && (
						<Button
							variant="outline"
							size="icon"
							className="h-8 w-8 shrink-0"
							onClick={() => {
								onChange("");
								setImgError(false);
							}}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</div>

			<ImagePickerModal
				open={open}
				onClose={() => setOpen(false)}
				onSelect={(url) => {
					setImgError(false);
					onChange(url);
					setOpen(false);
				}}
			/>
		</div>
	);
}

// ─── media field (video / generic file) ──────────────────────────────────────

function MediaField({
	label,
	description,
	value,
	onChange,
	mediaType,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
	mediaType: "video" | "file";
}) {
	const [open, setOpen] = useState(false);
	const Icon = mediaType === "video" ? VideoIcon : FileIcon;
	const placeholder =
		mediaType === "video" ? "Click to select video" : "Click to select file";
	const addLabel = mediaType === "video" ? "Add video" : "Add file";

	const filename = value
		? (() => {
				try {
					return decodeURIComponent(
						new URL(value).pathname.split("/").pop() ?? value,
					);
				} catch {
					return value.split("/").pop() ?? value;
				}
			})()
		: "";
	const ext = filename.includes(".")
		? filename.split(".").pop()?.toUpperCase()
		: undefined;
	const stem = ext ? filename.slice(0, filename.lastIndexOf(".")) : filename;

	return (
		<div className="space-y-1.5">
			<FieldLabel label={label} description={description} />
			<div className="overflow-hidden rounded-lg border bg-muted/20">
				<button
					type="button"
					className="w-full text-left"
					onClick={() => setOpen(true)}
				>
					{value ? (
						<div className="flex items-center gap-2 px-3 py-3">
							<Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<p className="truncate font-mono text-xs font-semibold">
									{stem}
								</p>
								{ext && (
									<p className="text-[10px] uppercase text-muted-foreground">
										{ext}
									</p>
								)}
							</div>
						</div>
					) : (
						<div className="flex h-20 flex-col items-center justify-center gap-1.5 text-muted-foreground">
							<Icon className="h-8 w-8" />
							<span className="text-xs">{placeholder}</span>
						</div>
					)}
				</button>
				<div className="flex gap-2 border-t px-2 py-2">
					<Button
						variant="outline"
						size="sm"
						className="h-8 flex-1 text-xs"
						onClick={() => setOpen(true)}
					>
						{value ? (
							<>
								Change <ChevronDown className="ml-1 h-3 w-3" />
							</>
						) : (
							<>
								<Icon className="mr-1 h-3 w-3" /> {addLabel}
							</>
						)}
					</Button>
					{value && (
						<Button
							variant="outline"
							size="icon"
							className="h-8 w-8 shrink-0"
							onClick={() => onChange("")}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</div>

			<ImagePickerModal
				open={open}
				onClose={() => setOpen(false)}
				onSelect={(url) => {
					onChange(url);
					setOpen(false);
				}}
			/>
		</div>
	);
}

// ─── array field ──────────────────────────────────────────────────────────────

function emptyItemFrom(template: FormValue): FormValue {
	if (
		template !== null &&
		typeof template === "object" &&
		!Array.isArray(template)
	) {
		return Object.fromEntries(
			Object.entries(template as Record<string, FormValue>)
				.filter(([k]) => !k.startsWith("__"))
				.map(([k, v]) => [
					k,
					typeof v === "string"
						? ""
						: typeof v === "number"
							? 0
							: typeof v === "boolean"
								? false
								: Array.isArray(v)
									? []
									: typeof v === "object"
										? {}
										: "",
				]),
		);
	}
	if (typeof template === "number") return 0;
	if (typeof template === "boolean") return false;
	return "";
}

function getItemLabel(value: FormValue, index: number): string {
	if (typeof value === "string") return value || `Item ${index + 1}`;
	if (typeof value === "number") return String(value);
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		const obj = value as Record<string, FormValue>;
		for (const key of ["name", "label", "title", "type"]) {
			const v = obj[key];
			if (typeof v === "string" && v) return v;
		}
		const rt = obj.__resolveType;
		if (typeof rt === "string" && rt) {
			const parts = rt.split("/");
			return parts[parts.length - 1].replace(/\.tsx?$/, "");
		}
	}
	return `Item ${index + 1}`;
}

function SortableArrayRow({
	id,
	index,
	value,
	onSelect,
	onDuplicate,
	onRemove,
}: {
	id: string;
	index: number;
	value: FormValue;
	onSelect: () => void;
	onDuplicate: () => void;
	onRemove: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.4 : 1,
			}}
			className="group flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
		>
			<span
				{...listeners}
				{...attributes}
				className="shrink-0 cursor-grab touch-none text-muted-foreground/40 active:cursor-grabbing"
				onClick={(e) => e.stopPropagation()}
			>
				<GripVertical className="h-3 w-3" />
			</span>
			<span className="flex-1 truncate text-xs" onClick={onSelect}>
				{getItemLabel(value, index)}
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100"
					>
						<MoreHorizontal className="h-3 w-3" />
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

function ArrayField({
	label,
	description,
	value,
	onChange,
	depth,
}: {
	label: string;
	description?: string;
	value: FormValue[];
	onChange: (v: FormValue[]) => void;
	depth: number;
}) {
	const [open, setOpen] = useState(false);
	const [editIndex, setEditIndex] = useState<number | null>(null);
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 250, tolerance: 5 },
		}),
	);
	const ids = value.map((_, i) => String(i));

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from === -1 || to === -1) return;
		const next = [...value];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		onChange(next);
	};

	const handleRemove = (i: number) => {
		onChange(value.filter((_, j) => j !== i));
		setEditIndex(null);
	};

	return (
		<div className="space-y-1">
			<button
				type="button"
				onClick={() => {
					setOpen((o) => !o);
					setEditIndex(null);
				}}
				className="flex w-full items-center gap-1 text-left"
			>
				{open ? (
					<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
				)}
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
				<span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
					{value.length}
				</span>
			</button>
			{description && !open && (
				<span className="block text-[10px] text-muted-foreground/70 pl-4">
					{description}
				</span>
			)}

			{open && editIndex !== null ? (
				<div className={nestClass(depth)}>
					<div className="mb-2 flex items-center gap-1">
						<button
							type="button"
							onClick={() => setEditIndex(null)}
							className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</button>
						<span className="flex-1 truncate text-xs font-medium">
							{getItemLabel(value[editIndex], editIndex)}
						</span>
						<button
							type="button"
							onClick={() => handleRemove(editIndex)}
							className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							title="Remove"
						>
							<Trash2 className="h-3 w-3" />
						</button>
					</div>
					<FormField
						name="item"
						value={value[editIndex]}
						onChange={(v) => {
							const next = [...value];
							next[editIndex] = v;
							onChange(next);
						}}
						depth={depth + 1}
						hideLabel
					/>
				</div>
			) : open ? (
				<div className={nestClass(depth)}>
					<DndContext
						sensors={sensors}
						modifiers={[restrictToVerticalAxis]}
						onDragEnd={handleDragEnd}
					>
						<SortableContext items={ids} strategy={verticalListSortingStrategy}>
							{value.map((item, i) => (
								<SortableArrayRow
									key={i}
									id={String(i)}
									index={i}
									value={item}
									onSelect={() => setEditIndex(i)}
									onDuplicate={() => {
										const next = [...value];
										next.splice(i + 1, 0, structuredClone(item));
										onChange(next);
									}}
									onRemove={() => onChange(value.filter((_, j) => j !== i))}
								/>
							))}
						</SortableContext>
					</DndContext>
					<button
						type="button"
						onClick={() => onChange([...value, emptyItemFrom(value[0] ?? "")])}
						className="mt-1 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						<Plus className="h-3 w-3" />
						Add item
					</button>
				</div>
			) : null}
		</div>
	);
}

// ─── object field ─────────────────────────────────────────────────────────────

function ObjectField({
	label,
	description,
	value,
	onChange,
	depth,
	hideLabel,
	fieldSchema,
	schemasMap = {},
}: {
	label: string;
	description?: string;
	value: Record<string, FormValue>;
	onChange: (v: Record<string, FormValue>) => void;
	depth: number;
	hideLabel?: boolean;
	/** When provided, drives which keys are rendered (shows empty fields too) */
	fieldSchema?: SchemaProperties;
	schemasMap?: Record<string, SchemaProperties>;
}) {
	const [open, setOpen] = useState(false);

	// Schema-driven: show all declared keys; data-driven: show existing keys
	const keys: string[] = fieldSchema
		? Object.keys(fieldSchema).filter(
				(k) => !k.startsWith("__") && k !== "@type",
			)
		: Object.entries(value)
				.filter(([k]) => !k.startsWith("__"))
				.map(([k]) => k);

	if (keys.length === 0) return null;

	return (
		<div className="space-y-1">
			{!hideLabel && label && (
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="flex w-full items-center gap-1 text-left"
				>
					{open ? (
						<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
					)}
					<span className="text-xs font-medium text-muted-foreground">
						{label}
					</span>
				</button>
			)}
			{description && !hideLabel && (
				<span className="block text-[10px] text-muted-foreground/70 pl-4">
					{description}
				</span>
			)}
			{(open || hideLabel) && (
				<div
					className={cn("space-y-3", !hideLabel && label && nestClass(depth))}
				>
					{keys.map((k) => {
						const prop = fieldSchema?.[k];
						return (
							<FormField
								key={k}
								name={k}
								label={prop?.title}
								description={prop?.description}
								schemaType={prop?.type}
								schemaDefault={prop?.default}
								schemaEnum={prop?.enum}
								schemaFormat={prop?.format}
								fieldSchema={prop?.properties}
								anyOfRefs={prop?.anyOfRefs}
								schemasMap={schemasMap}
								value={value[k] as FormValue}
								onChange={(nv) => onChange({ ...value, [k]: nv })}
								depth={depth + 1}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── select field ─────────────────────────────────────────────────────────────

// Sentinel used in place of "" since Radix Select forbids empty-string values
const EMPTY_SENTINEL = "__empty__";

function SelectField({
	label,
	description,
	value,
	options,
	onChange,
}: {
	label: string;
	description?: string;
	value: string;
	options: unknown[];
	onChange: (v: string) => void;
}) {
	// Radix Select does not allow value="" — encode it as a sentinel internally
	const toSelectValue = (v: string) => (v === "" ? EMPTY_SENTINEL : v);
	const fromSelectValue = (v: string) => (v === EMPTY_SENTINEL ? "" : v);

	return (
		<div className="space-y-1">
			<FieldLabel label={label} description={description} />
			<Select
				value={toSelectValue(value)}
				onValueChange={(v) => onChange(fromSelectValue(v))}
			>
				<SelectTrigger className="h-7 text-xs">
					<SelectValue placeholder="Select…" />
				</SelectTrigger>
				<SelectContent>
					{options.map((opt) => {
						const raw = String(opt);
						const selectVal = toSelectValue(raw);
						return (
							<SelectItem key={selectVal} value={selectVal} className="text-xs">
								{raw === "" ? "—" : raw}
							</SelectItem>
						);
					})}
				</SelectContent>
			</Select>
		</div>
	);
}

// ─── vtex product list modal ──────────────────────────────────────────────────

const VTEX_LOADER_RESOLVE_TYPE = "vtex/loaders/legacy/productList.ts";

type VtexMode = "term" | "collection" | "fq" | "ids" | "productIds";

const VTEX_MODES: Array<{
	id: VtexMode;
	label: string;
	description: string;
}> = [
	{
		id: "term",
		label: "Keyword Search",
		description: "Find products by a search term.",
	},
	{
		id: "collection",
		label: "Collection ID",
		description: "Fetch products from a VTEX collection or product cluster.",
	},
	{
		id: "fq",
		label: "Advanced Facets",
		description:
			"Filter via VTEX fq query parameters (e.g. specificationFilter).",
	},
	{
		id: "ids",
		label: "SKU IDs",
		description: "Retrieve specific products by their SKU identifiers.",
	},
	{
		id: "productIds",
		label: "Product IDs",
		description: "Retrieve specific products by their product identifiers.",
	},
];

const LEGACY_SORT_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "", label: "Relevance" },
	{ value: "OrderByScoreDESC", label: "Score" },
	{ value: "OrderByPriceDESC", label: "Price: High → Low" },
	{ value: "OrderByPriceASC", label: "Price: Low → High" },
	{ value: "OrderByTopSaleDESC", label: "Top Sales" },
	{ value: "OrderByReviewRateDESC", label: "Review Rate" },
	{ value: "OrderByNameDESC", label: "Name: Z → A" },
	{ value: "OrderByNameASC", label: "Name: A → Z" },
	{ value: "OrderByReleaseDateDESC", label: "Release Date" },
	{ value: "OrderByBestDiscountDESC", label: "Best Discount" },
];

function detectVtexMode(props: Record<string, FormValue>): VtexMode {
	if ("collection" in props) return "collection";
	if ("fq" in props) return "fq";
	if ("ids" in props) return "ids";
	if ("productIds" in props) return "productIds";
	return "term";
}

function emptyPropsForMode(mode: VtexMode): Record<string, FormValue> {
	switch (mode) {
		case "term":
			return { term: "", sort: "", count: 12 };
		case "collection":
			return { collection: "", sort: "", count: 12 };
		case "fq":
			return { fq: [], sort: "", count: 12 };
		case "ids":
			return { ids: [], similars: false };
		case "productIds":
			return { productIds: [], similars: false };
	}
}

function vtexModeSummary(
	mode: VtexMode,
	props: Record<string, FormValue>,
): string {
	switch (mode) {
		case "term": {
			const term = props.term as string | undefined;
			return term ? `"${term}"` : "No term set";
		}
		case "collection": {
			const col = props.collection as string | undefined;
			return col ? `Collection ${col}` : "No collection set";
		}
		case "fq": {
			const fq = (props.fq as string[] | undefined) ?? [];
			return fq.length > 0
				? `${fq.length} filter${fq.length > 1 ? "s" : ""}`
				: "No filters set";
		}
		case "ids": {
			const ids = (props.ids as string[] | undefined) ?? [];
			return ids.length > 0
				? `${ids.length} SKU${ids.length > 1 ? "s" : ""}`
				: "No SKUs set";
		}
		case "productIds": {
			const pids = (props.productIds as string[] | undefined) ?? [];
			return pids.length > 0
				? `${pids.length} product${pids.length > 1 ? "s" : ""}`
				: "No products set";
		}
	}
}

function VtexStringArrayEditor({
	label,
	description,
	value,
	placeholder,
	onChange,
}: {
	label: string;
	description?: string;
	value: string[];
	placeholder?: string;
	onChange: (v: string[]) => void;
}) {
	return (
		<div className="space-y-1.5">
			<FieldLabel label={label} description={description} />
			<div className="space-y-1.5">
				{value.map((item, i) => (
					<div key={i} className="flex gap-1.5 items-center">
						<Input
							value={item}
							onChange={(e) => {
								const next = [...value];
								next[i] = e.target.value;
								onChange(next);
							}}
							placeholder={placeholder}
							className="h-7 text-xs flex-1"
						/>
						<button
							type="button"
							onClick={() => onChange(value.filter((_, j) => j !== i))}
							className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
						>
							<Trash2 className="h-3 w-3" />
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={() => onChange([...value, ""])}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
				>
					<Plus className="h-3 w-3" />
					Add item
				</button>
			</div>
		</div>
	);
}

function VtexLogo() {
	return (
		<img
			src="https://assets.decocache.com/admin/ebf5f465-021c-4279-ad6f-f2789d103cd4/vtex.png"
			alt="VTEX"
			className="h-5 shrink-0 object-contain"
		/>
	);
}

function VtexProductListModal({
	open,
	onClose,
	props,
	onSave,
}: {
	open: boolean;
	onClose: () => void;
	props: Record<string, FormValue>;
	onSave: (newProps: Record<string, FormValue>) => void;
}) {
	const [mode, setMode] = useState<VtexMode>(() => detectVtexMode(props));
	const [draft, setDraft] = useState<Record<string, FormValue>>(() => ({
		...props,
	}));

	useEffect(() => {
		if (open) {
			const m = detectVtexMode(props);
			setMode(m);
			setDraft({ ...props });
		}
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleModeChange = (newMode: VtexMode) => {
		if (newMode === mode) return;
		const next = emptyPropsForMode(newMode);
		// carry over shared fields
		if ("sort" in draft && "sort" in next) next.sort = draft.sort ?? "";
		if ("count" in draft && "count" in next)
			next.count = (draft.count as number) ?? 12;
		setMode(newMode);
		setDraft(next);
	};

	const update = (key: string, val: FormValue) =>
		setDraft((d) => ({ ...d, [key]: val }));

	const sortVal = (draft.sort as string) ?? "";
	const countVal = (draft.count as number) ?? 12;
	const similarsVal = (draft.similars as boolean) ?? false;
	const hasSort = mode === "term" || mode === "collection" || mode === "fq";
	const hasCount = hasSort;
	const hasSimilars = mode === "ids" || mode === "productIds";

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex max-h-[85vh] w-[500px] flex-col gap-0 p-0 overflow-hidden">
				{/* Header */}
				<div className="shrink-0 border-b px-5 py-4 bg-[#F71963]/5">
					<div className="flex items-center gap-3">
						<VtexLogo />
						<div className="min-w-0">
							<p className="text-sm font-semibold leading-none text-foreground">
								Product List
							</p>
							<p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
								vtex/loaders/legacy/productList.ts
							</p>
						</div>
					</div>
				</div>

				{/* Mode tabs */}
				<div className="shrink-0 border-b bg-muted/30 px-5">
					<div className="flex gap-0 overflow-x-auto">
						{VTEX_MODES.map((m) => (
							<button
								key={m.id}
								type="button"
								onClick={() => handleModeChange(m.id)}
								className={cn(
									"shrink-0 border-b-2 px-3 py-2.5 text-[11px] font-medium transition-colors whitespace-nowrap",
									mode === m.id
										? "border-[#F71963] text-[#F71963]"
										: "border-transparent text-muted-foreground hover:text-foreground",
								)}
							>
								{m.label}
							</button>
						))}
					</div>
				</div>

				{/* Fields */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-5 py-4 space-y-4">
						<p className="text-[11px] text-muted-foreground leading-snug -mt-1">
							{VTEX_MODES.find((m) => m.id === mode)?.description}
						</p>

						{mode === "term" && (
							<TextField
								label="Search Term"
								description='Keyword to search for products (e.g. "case", "shirt")'
								value={(draft.term as string) ?? ""}
								onChange={(v) => update("term", v)}
							/>
						)}

						{mode === "collection" && (
							<TextField
								label="Collection ID"
								description="Collection ID or Product Cluster ID from your VTEX catalog"
								value={(draft.collection as string) ?? ""}
								onChange={(v) => update("collection", v)}
							/>
						)}

						{mode === "fq" && (
							<VtexStringArrayEditor
								label="Facet Queries (fq)"
								description='VTEX filter queries, e.g. "C:/1/2/" or "specificationFilter_123:value"'
								value={(draft.fq as string[]) ?? []}
								placeholder="e.g. C:/1/2/"
								onChange={(v) => update("fq", v)}
							/>
						)}

						{mode === "ids" && (
							<VtexStringArrayEditor
								label="SKU IDs"
								description="List of SKU identifiers to retrieve"
								value={(draft.ids as string[]) ?? []}
								placeholder="e.g. 12345"
								onChange={(v) => update("ids", v)}
							/>
						)}

						{mode === "productIds" && (
							<VtexStringArrayEditor
								label="Product IDs"
								description="List of product identifiers to retrieve"
								value={(draft.productIds as string[]) ?? []}
								placeholder="e.g. 12345"
								onChange={(v) => update("productIds", v)}
							/>
						)}

						{hasSort && (
							<div className="space-y-1">
								<FieldLabel label="Sort" description="Product sort order" />
								<Select
									value={sortVal === "" ? EMPTY_SENTINEL : sortVal}
									onValueChange={(v) =>
										update("sort", v === EMPTY_SENTINEL ? "" : v)
									}
								>
									<SelectTrigger className="h-7 text-xs">
										<SelectValue placeholder="Relevance" />
									</SelectTrigger>
									<SelectContent>
										{LEGACY_SORT_OPTIONS.map((opt) => (
											<SelectItem
												key={opt.value === "" ? EMPTY_SENTINEL : opt.value}
												value={opt.value === "" ? EMPTY_SENTINEL : opt.value}
												className="text-xs"
											>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{hasCount && (
							<NumberField
								label="Count"
								description="Total number of products to display"
								value={countVal}
								onChange={(v) => update("count", v)}
							/>
						)}

						{hasSimilars && (
							<CheckboxField
								label="Include Similar Products"
								description="Include similar / related products (deprecated — prefer product extensions)"
								value={similarsVal}
								onChange={(v) => update("similars", v)}
							/>
						)}
					</div>
				</ScrollArea>

				{/* Footer */}
				<DialogFooter className="shrink-0 border-t px-5 py-3">
					<Button
						variant="outline"
						size="sm"
						onClick={onClose}
						className="h-7 text-xs"
					>
						Cancel
					</Button>
					<Button
						size="sm"
						onClick={() => onSave(draft)}
						className="h-7 text-xs bg-[#F71963] hover:bg-[#F71963]/90 text-white"
					>
						Save changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── block-ref field ──────────────────────────────────────────────────────────

type AnyOfRef = { resolveType: string; title: string; description?: string };

function BlockRefField({
	label,
	description,
	value,
	onChange,
	depth,
	anyOfRefs,
	schemasMap = {},
}: {
	label: string;
	description?: string;
	value: Record<string, FormValue>;
	onChange: (v: Record<string, FormValue>) => void;
	depth: number;
	anyOfRefs: AnyOfRef[];
	schemasMap?: Record<string, SchemaProperties>;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [vtexModalOpen, setVtexModalOpen] = useState(false);
	const currentResolveType = value.__resolveType as string | undefined;

	const currentOption = anyOfRefs.find(
		(r) =>
			currentResolveType === r.resolveType ||
			currentResolveType?.endsWith(r.resolveType) ||
			r.resolveType.endsWith(currentResolveType ?? "___"),
	);
	const displayTitle =
		currentOption?.title ??
		currentResolveType
			?.split("/")
			.pop()
			?.replace(/\.tsx?$/, "") ??
		"None";

	const handleSelect = (resolveType: string) => {
		onChange({ __resolveType: resolveType } as Record<string, FormValue>);
		setOpen(false);
		setSearch("");
	};

	const isVtexProductList =
		currentResolveType === VTEX_LOADER_RESOLVE_TYPE ||
		currentResolveType?.endsWith(`/${VTEX_LOADER_RESOLVE_TYPE}`) ||
		false;

	const loaderSchema = currentResolveType
		? (schemasMap[currentResolveType] ?? null)
		: null;

	const skipKey = (k: string) => k.startsWith("__") || k === "@type";

	const innerKeys: string[] = loaderSchema
		? Object.keys(loaderSchema).filter((k) => !skipKey(k))
		: Object.entries(value)
				.filter(([k]) => !skipKey(k))
				.map(([k]) => k);

	const filtered = anyOfRefs.filter(
		(r) =>
			!search ||
			r.title.toLowerCase().includes(search.toLowerCase()) ||
			r.resolveType.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />

			{/* Current selection — click to open picker (only if options exist) */}
			{anyOfRefs.length > 0 && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 w-full justify-between gap-2 px-2.5 text-xs font-normal"
					onClick={() => setOpen(true)}
				>
					<span className="truncate text-foreground/90">{displayTitle}</span>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						change ↗
					</span>
				</Button>
			)}

			{/* Loader picker modal */}
			<Dialog
				open={open}
				onOpenChange={(v) => {
					setOpen(v);
					if (!v) setSearch("");
				}}
			>
				<DialogContent className="flex max-h-[70vh] w-[520px] flex-col gap-0 p-0">
					<DialogHeader className="shrink-0 border-b px-4 py-3">
						<span className="text-sm font-semibold">
							{label ? `Change ${label}` : "Select loader"}
						</span>
					</DialogHeader>
					<div className="shrink-0 border-b px-3 py-2">
						<Input
							autoFocus
							placeholder="Search…"
							className="h-7 text-xs"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{filtered.length === 0 ? (
							<div className="py-8 text-center text-xs text-muted-foreground">
								No options found
							</div>
						) : (
							<div className="divide-y">
								{filtered.map((ref) => {
									const isCurrent =
										currentResolveType === ref.resolveType ||
										currentResolveType?.endsWith(ref.resolveType) ||
										ref.resolveType.endsWith(currentResolveType ?? "___");
									return (
										<button
											key={ref.resolveType}
											type="button"
											onClick={() => handleSelect(ref.resolveType)}
											className={cn(
												"group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
												isCurrent && "bg-accent/60",
											)}
										>
											<span
												className={cn(
													"mt-1 h-2 w-2 shrink-0 rounded-full border-2",
													isCurrent
														? "border-primary bg-primary"
														: "border-muted-foreground/30 bg-transparent group-hover:border-primary/50",
												)}
											/>
											<div className="min-w-0 flex-1 space-y-0.5">
												<div className="flex items-center gap-2">
													<span
														className={cn(
															"text-xs font-medium",
															isCurrent ? "text-primary" : "text-foreground",
														)}
													>
														{ref.title}
													</span>
													{isCurrent && (
														<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															current
														</span>
													)}
												</div>
												{ref.description && (
													<p className="text-[10px] leading-snug text-muted-foreground">
														{ref.description}
													</p>
												)}
												<p className="truncate font-mono text-[9px] text-muted-foreground/50">
													{ref.resolveType}
												</p>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{/* VTEX product list — dedicated configure button + modal */}
			{isVtexProductList &&
				(() => {
					const vtexProps = (value.props as Record<string, FormValue>) ?? {};
					const vtexMode = detectVtexMode(vtexProps);
					const summary = vtexModeSummary(vtexMode, vtexProps);
					const modeLabel =
						VTEX_MODES.find((m) => m.id === vtexMode)?.label ?? vtexMode;
					return (
						<>
							<button
								type="button"
								onClick={() => setVtexModalOpen(true)}
								className="group flex w-full items-center gap-2.5 rounded-md border border-[#F71963]/30 bg-[#F71963]/5 px-3 py-2 text-left transition-colors hover:bg-[#F71963]/10"
							>
								<VtexLogo />
								<div className="min-w-0 flex-1">
									<p className="text-[11px] font-medium text-foreground leading-none">
										{modeLabel}
									</p>
									<p className="text-[10px] text-muted-foreground mt-0.5 truncate">
										{summary}
									</p>
								</div>
								<span className="shrink-0 text-[10px] text-[#F71963]/70 group-hover:text-[#F71963] transition-colors">
									configure ↗
								</span>
							</button>
							<VtexProductListModal
								open={vtexModalOpen}
								onClose={() => setVtexModalOpen(false)}
								props={vtexProps}
								onSave={(newProps) => {
									onChange({ ...value, props: newProps as FormValue });
									setVtexModalOpen(false);
								}}
							/>
						</>
					);
				})()}

			{/* Inner config for the selected loader (generic) */}
			{!isVtexProductList && innerKeys.length > 0 && (
				<div className={cn("space-y-3", nestClass(depth))}>
					{innerKeys.map((k) => {
						const prop = loaderSchema?.[k];
						return (
							<FormField
								key={k}
								name={k}
								label={prop?.title}
								description={prop?.description}
								schemaType={prop?.type}
								schemaDefault={prop?.default}
								schemaEnum={prop?.enum}
								schemaFormat={prop?.format}
								fieldSchema={prop?.properties}
								anyOfRefs={prop?.anyOfRefs}
								schemasMap={schemasMap}
								value={value[k] as FormValue}
								onChange={(nv) => onChange({ ...value, [k]: nv })}
								depth={depth + 1}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── generic field dispatcher ─────────────────────────────────────────────────

function FormField({
	name,
	value,
	onChange,
	depth = 0,
	hideLabel,
	label: labelOverride,
	schemaType,
	schemaDefault,
	schemaEnum,
	schemaFormat,
	description,
	fieldSchema,
	anyOfRefs,
	schemasMap = {},
}: {
	name: string;
	value: FormValue;
	onChange: (v: FormValue) => void;
	depth?: number;
	hideLabel?: boolean;
	/** Title from the schema (overrides humanize(name)) */
	label?: string;
	/** Type hint from the schema (used when value is null/undefined) */
	schemaType?: string;
	/** Default value from the schema (used when value is null/undefined) */
	schemaDefault?: unknown;
	/** Enum options from the schema */
	schemaEnum?: unknown[];
	/** Format hint from the schema (e.g. "color-input", "textarea", "image-uri") */
	schemaFormat?: string;
	description?: string;
	/** Nested schema properties for object-type fields */
	fieldSchema?: SchemaProperties;
	/** Block-ref options for loader-selector fields */
	anyOfRefs?: AnyOfRef[];
	/** Schemas for nested block types, keyed by resolveType */
	schemasMap?: Record<string, SchemaProperties>;
}) {
	const label = hideLabel ? "" : (labelOverride ?? humanize(name));

	// ── block-ref field (loader selector) ─────────────────────────────────
	// Two cases:
	// 1. Schema correctly says "block-ref" (schema has anyOf of loader refs)
	// 2. Runtime value has __resolveType — always a deco.cx block reference
	//    even if the schema types the field as the OUTPUT type (e.g. Product[])
	const isBlockRef =
		schemaType === "block-ref" ||
		(value !== null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			typeof (value as Record<string, unknown>).__resolveType === "string");

	if (isBlockRef) {
		const objValue =
			value !== null &&
			value !== undefined &&
			typeof value === "object" &&
			!Array.isArray(value)
				? (value as Record<string, FormValue>)
				: ({} as Record<string, FormValue>);
		return (
			<BlockRefField
				label={label}
				description={description}
				value={objValue}
				onChange={onChange as (v: Record<string, FormValue>) => void}
				depth={depth}
				anyOfRefs={anyOfRefs ?? []}
				schemasMap={schemasMap}
			/>
		);
	}

	// If we have no value, try to produce a typed empty default from the schema.
	// Without a schema hint, skip the field (preserve original behaviour).
	const effectiveValue: FormValue =
		value === null || value === undefined
			? schemaType !== undefined && schemaType !== "block-ref"
				? defaultForSchemaType(schemaType, schemaDefault)
				: null
			: value;

	if (effectiveValue === null || effectiveValue === undefined) return null;

	// Determine render type: prefer schema type when value was originally missing,
	// otherwise infer from the actual value.
	const renderType: string =
		value === null || value === undefined
			? (schemaType ?? typeof effectiveValue)
			: Array.isArray(effectiveValue)
				? "array"
				: typeof effectiveValue;

	if (renderType === "array" || Array.isArray(effectiveValue)) {
		return (
			<ArrayField
				label={label || name}
				description={description}
				value={effectiveValue as FormValue[]}
				onChange={onChange as (v: FormValue[]) => void}
				depth={depth}
			/>
		);
	}

	switch (renderType) {
		case "boolean":
			return (
				<CheckboxField
					label={label}
					description={description}
					value={effectiveValue as boolean}
					onChange={onChange as (v: boolean) => void}
				/>
			);
		case "number":
		case "integer":
			return (
				<NumberField
					label={label}
					description={description}
					value={effectiveValue as number}
					onChange={onChange as (v: number) => void}
				/>
			);
		case "string": {
			if (schemaEnum && schemaEnum.length > 0) {
				return (
					<SelectField
						label={label}
						description={description}
						value={effectiveValue as string}
						options={schemaEnum}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			// ── format-based widgets ──────────────────────────────────
			if (schemaFormat === "color-input") {
				return (
					<ColorInputField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			if (schemaFormat === "textarea") {
				return (
					<TextareaField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			if (schemaFormat === "image-uri") {
				return (
					<ImageField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			if (schemaFormat === "video-uri") {
				return (
					<MediaField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
						mediaType="video"
					/>
				);
			}
			if (schemaFormat === "file-uri") {
				return (
					<MediaField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
						mediaType="file"
					/>
				);
			}
			if (schemaFormat === "date") {
				return (
					<DateField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
						mode="date"
					/>
				);
			}
			if (schemaFormat === "date-time") {
				return (
					<DateField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
						mode="date-time"
					/>
				);
			}
			if (schemaFormat === "code") {
				return (
					<CodeField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			if (schemaFormat === "html" || schemaFormat === "rich-text") {
				return (
					<RichTextField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			if (
				schemaFormat === "html-inline" ||
				schemaFormat === "rich-text-inline"
			) {
				return (
					<RichTextField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
						inline
					/>
				);
			}
			// ── name heuristic fallback ──────────────────────────────
			if (isImageField(name, effectiveValue)) {
				return (
					<ImageField
						label={label}
						description={description}
						value={effectiveValue as string}
						onChange={onChange as (v: string) => void}
					/>
				);
			}
			return (
				<TextField
					label={label}
					description={description}
					value={effectiveValue as string}
					onChange={onChange as (v: string) => void}
				/>
			);
		}
		case "object":
			if (
				effectiveValue !== null &&
				typeof effectiveValue === "object" &&
				!Array.isArray(effectiveValue)
			) {
				return (
					<ObjectField
						label={label}
						description={description}
						value={effectiveValue as Record<string, FormValue>}
						onChange={onChange as (v: Record<string, FormValue>) => void}
						depth={depth}
						hideLabel={hideLabel}
						fieldSchema={fieldSchema}
						schemasMap={schemasMap}
					/>
				);
			}
			return null;
		default:
			return null;
	}
}

// ─── section form (public) ────────────────────────────────────────────────────

export function SectionForm({
	data,
	schema,
	schemasMap = {},
	onChange,
	readOnly,
	savedBlockKey,
	onEditGlobally,
	onSaveGlobally,
	onCancelGlobally,
	saving,
}: {
	data: Record<string, unknown>;
	/**
	 * When provided, all declared schema properties are rendered — even if
	 * they are missing from `data`. Each field gets its label, type, and
	 * default value from the schema.
	 */
	schema?: SchemaProperties;
	/** Schemas for nested block types (loaders, etc.) keyed by resolveType */
	schemasMap?: Record<string, SchemaProperties>;
	onChange: (data: Record<string, unknown>) => void;
	/** When true, fields are displayed but not editable */
	readOnly?: boolean;
	/** Block key for saved blocks (shown in the read-only banner) */
	savedBlockKey?: string;
	onEditGlobally?: () => void;
	onSaveGlobally?: () => void;
	onCancelGlobally?: () => void;
	saving?: boolean;
}) {
	const keys: string[] = schema
		? Object.keys(schema).filter((k) => !k.startsWith("__") && k !== "@type")
		: Object.keys(data).filter((k) => !k.startsWith("__"));

	if (keys.length === 0) {
		return (
			<div className="px-3 py-6 text-center text-xs text-muted-foreground">
				No editable fields on this section.
			</div>
		);
	}

	return (
		<div className="min-h-0 flex-1 block! min-w-auto overflow-y-auto">
			{readOnly && (
				<style>
					{`[data-cms-readonly] input,
[data-cms-readonly] textarea,
[data-cms-readonly] select,
[data-cms-readonly] [role="combobox"],
[data-cms-readonly] [role="slider"],
[data-cms-readonly] [role="switch"],
[data-cms-readonly] [contenteditable] {
  pointer-events: none;
  opacity: 0.6;
}`}
				</style>
			)}
			{readOnly && (
				<div
					className="sticky top-0 z-10 border-b px-3 py-2.5"
					style={{
						borderColor: "oklch(0.7278 0.151 289 / 0.25)",
						background: "oklch(0.97 0.01 289)",
					}}
				>
					<p
						className="mb-2 text-[11px] leading-snug"
						style={{ color: "oklch(0.55 0.12 289)" }}
					>
						Changing this block will update all pages where it is used.
					</p>
					<button
						type="button"
						onClick={onEditGlobally}
						className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
						style={{ background: "oklch(0.7278 0.151 289)" }}
					>
						Edit globally{savedBlockKey ? ` (${savedBlockKey})` : ""}
					</button>
				</div>
			)}
			{!readOnly && savedBlockKey && (
				<div
					className="sticky top-0 z-10 border-b px-3 py-2.5"
					style={{
						borderColor: "oklch(0.7278 0.151 289 / 0.25)",
						background: "oklch(0.97 0.01 289)",
					}}
				>
					<p
						className="mb-1.5 text-[11px] leading-snug"
						style={{ color: "oklch(0.55 0.12 289)" }}
					>
						Editing shared block. Save to apply everywhere.
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onCancelGlobally}
							disabled={saving}
							className="flex flex-1 items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
							style={{
								borderColor: "oklch(0.7278 0.151 289 / 0.3)",
								color: "oklch(0.55 0.12 289)",
							}}
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={onSaveGlobally}
							disabled={saving}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
							style={{ background: "oklch(0.7278 0.151 289)" }}
						>
							{saving ? "Saving…" : "Save"}
						</button>
					</div>
				</div>
			)}
			<div
				className="space-y-4 p-3"
				{...(readOnly ? { "data-cms-readonly": "" } : {})}
			>
				{keys.map((key) => {
					const prop = schema?.[key];
					return (
						<FormField
							key={key}
							name={key}
							label={prop?.title}
							description={prop?.description}
							schemaType={prop?.type}
							schemaDefault={prop?.default}
							schemaEnum={prop?.enum}
							schemaFormat={prop?.format}
							fieldSchema={prop?.properties}
							anyOfRefs={prop?.anyOfRefs}
							schemasMap={schemasMap}
							value={data[key] as FormValue}
							onChange={(v) => onChange({ ...data, [key]: v })}
							depth={0}
						/>
					);
				})}
			</div>
		</div>
	);
}
