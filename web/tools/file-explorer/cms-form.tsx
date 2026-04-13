import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	GripVertical,
	ImageIcon,
	MoreHorizontal,
	Plus,
	Trash2,
} from "lucide-react";
import { useState } from "react";
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
	DialogHeader,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
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
	const [imgError, setImgError] = useState(false);
	return (
		<div className="space-y-1.5">
			<FieldLabel label={label} description={description} />
			{value && !imgError ? (
				<div className="overflow-hidden rounded-md border">
					<img
						src={value}
						alt={label}
						className="h-20 w-full object-cover"
						onError={() => setImgError(true)}
					/>
				</div>
			) : value ? (
				<div className="flex h-10 items-center justify-center rounded-md border bg-muted/40">
					<ImageIcon className="h-4 w-4 text-muted-foreground" />
				</div>
			) : null}
			<Input
				value={value}
				onChange={(e) => {
					setImgError(false);
					onChange(e.target.value);
				}}
				className="h-7 font-mono text-[10px]"
				placeholder="https://…"
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
				<div className="ml-3 border-l pl-3">
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
				<div className="ml-3 border-l pl-3">
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
					className={cn(
						"space-y-3",
						!hideLabel && label && "ml-3 border-l pl-3",
					)}
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

			{/* Inner config for the selected loader */}
			{innerKeys.length > 0 && (
				<div className="ml-0.5 space-y-3 border-l pl-3">
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
}) {
	// Build the ordered list of keys to render.
	// If a schema is present, use its keys as the source of truth so every
	// declared property is visible even if absent from the current data.
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
		<ScrollArea className="min-h-0 flex-1">
			<div className="space-y-4 p-3">
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
		</ScrollArea>
	);
}
