import { format as formatDate } from "date-fns";
import {
	Award,
	Bell,
	Bike,
	Bookmark,
	Bus,
	Calendar as CalendarIcon,
	Camera,
	Car,
	Check,
	ChevronDown,
	Clock,
	Cloud,
	Coffee,
	Cookie,
	CreditCard,
	Download,
	Eye,
	EyeOff,
	FileText,
	Flag,
	Gift,
	Globe,
	Headphones,
	Heart,
	Home,
	Image,
	Link as LinkIcon,
	Lock,
	type LucideIcon,
	Mail,
	MapPin,
	MessageCircle,
	Mic,
	Minus,
	Moon,
	Music,
	Package,
	Phone,
	Pizza,
	Plane,
	Plus,
	Search,
	Send,
	Settings,
	Share,
	Shield,
	ShoppingBag,
	ShoppingCart,
	Smile,
	Star,
	Sun,
	Tag,
	ThumbsUp,
	Train,
	Trophy,
	Truck,
	Upload,
	User,
	Users,
	Utensils,
	Video,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import { FieldLabel } from "./cms-form.tsx";

// ─── 1. SwitchField — boolean toggle ─────────────────────────────────────────

export function SwitchField({
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
		<div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/10 px-4 py-3">
			<FieldLabel label={label} description={description} className="flex-1" />
			<Switch
				checked={value}
				onCheckedChange={onChange}
				className="mt-0.5 shrink-0"
			/>
		</div>
	);
}

// ─── 2. TagsField — chip-based string array ──────────────────────────────────

export function TagsField({
	label,
	description,
	value,
	onChange,
	placeholder = "Add tag…",
}: {
	label: string;
	description?: string;
	value: string[];
	onChange: (v: string[]) => void;
	placeholder?: string;
}) {
	const [draft, setDraft] = useState("");

	const commit = () => {
		const trimmed = draft.trim();
		if (!trimmed) return;
		if (value.includes(trimmed)) {
			setDraft("");
			return;
		}
		onChange([...value, trimmed]);
		setDraft("");
	};

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-2 text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
				{value.map((tag) => (
					<span
						key={tag}
						className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"
					>
						{tag}
						<button
							type="button"
							onClick={() => onChange(value.filter((t) => t !== tag))}
							className="rounded-sm text-muted-foreground hover:text-foreground"
						>
							<X className="h-3 w-3" />
						</button>
					</span>
				))}
				<input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === ",") {
							e.preventDefault();
							commit();
						}
						if (e.key === "Backspace" && !draft && value.length > 0) {
							onChange(value.slice(0, -1));
						}
					}}
					onBlur={commit}
					placeholder={value.length === 0 ? placeholder : ""}
					className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
		</div>
	);
}

// ─── 4. MultiSelectField — chip selector with enum ───────────────────────────

export function MultiSelectField({
	label,
	description,
	value,
	options,
	onChange,
}: {
	label: string;
	description?: string;
	value: string[];
	options: string[];
	onChange: (v: string[]) => void;
}) {
	const [open, setOpen] = useState(false);

	const toggle = (opt: string) => {
		if (value.includes(opt)) {
			onChange(value.filter((v) => v !== opt));
		} else {
			onChange([...value, opt]);
		}
	};

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex min-h-10 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						<div className="flex flex-1 flex-wrap items-center gap-1">
							{value.length === 0 ? (
								<span className="text-muted-foreground">Select…</span>
							) : (
								value.map((v) => (
									<span
										key={v}
										className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs"
									>
										{v}
									</span>
								))
							)}
						</div>
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-(--radix-popover-trigger-width) p-1"
					align="start"
				>
					{options.map((opt) => {
						const checked = value.includes(opt);
						return (
							<button
								key={opt}
								type="button"
								onClick={() => toggle(opt)}
								className={cn(
									"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent",
									checked && "font-medium",
								)}
							>
								<span
									className={cn(
										"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
										checked
											? "border-primary bg-primary text-primary-foreground"
											: "border-input",
									)}
								>
									{checked && <Check className="h-3 w-3" />}
								</span>
								<span className="flex-1 text-left">{opt}</span>
							</button>
						);
					})}
				</PopoverContent>
			</Popover>
		</div>
	);
}

// ─── 5. UrlField — URL with validation + favicon preview ─────────────────────

export function UrlField({
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
	let url: URL | null = null;
	try {
		url = value ? new URL(value) : null;
	} catch {
		url = null;
	}
	const isValid = Boolean(url);
	const isInternal = value.startsWith("/");
	const favicon =
		url?.hostname && !isInternal
			? `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`
			: null;

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<div className="flex h-10 w-full items-center rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
				<span className="flex h-full w-10 items-center justify-center border-r bg-muted/30 text-muted-foreground">
					{favicon ? (
						<img
							src={favicon}
							alt=""
							className="h-4 w-4"
							onError={(e) => {
								(e.target as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<LinkIcon className="h-4 w-4" />
					)}
				</span>
				<input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="https://example.com or /internal-path"
					className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
				/>
				{value && (
					<span
						className={cn(
							"mr-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
							isInternal
								? "bg-primary/10 text-primary"
								: isValid
									? "bg-success/15 text-success"
									: "bg-destructive/15 text-destructive",
						)}
					>
						{isInternal ? "internal" : isValid ? "valid" : "invalid"}
					</span>
				)}
			</div>
		</div>
	);
}

// ─── 6. MarkdownField — split-view editor ────────────────────────────────────

// Marked is only needed when the preview tab is open. Lazy-load and cache.
let markedParser: ((src: string) => string) | null = null;
let markedLoading: Promise<void> | null = null;

function loadMarked(): Promise<void> {
	if (markedParser) return Promise.resolve();
	if (!markedLoading) {
		markedLoading = import("marked").then(({ marked }) => {
			markedParser = (s) => marked.parse(s, { async: false }) as string;
		});
	}
	return markedLoading;
}

export function MarkdownField({
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
	const [tab, setTab] = useState<"write" | "preview">("write");
	const [, forceUpdate] = useState(0);

	useEffect(() => {
		if (tab !== "preview" || markedParser) return;
		let cancelled = false;
		loadMarked().then(() => {
			if (!cancelled) forceUpdate((n) => n + 1);
		});
		return () => {
			cancelled = true;
		};
	}, [tab]);

	const html = (() => {
		if (!markedParser) return null;
		try {
			return markedParser(value || "");
		} catch {
			return "";
		}
	})();

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<div className="overflow-hidden rounded-md border border-input">
				<div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1.5">
					<button
						type="button"
						onClick={() => setTab("write")}
						className={cn(
							"flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
							tab === "write"
								? "bg-background text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<FileText className="h-3.5 w-3.5" />
						Write
					</button>
					<button
						type="button"
						onClick={() => setTab("preview")}
						className={cn(
							"flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
							tab === "preview"
								? "bg-background text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Eye className="h-3.5 w-3.5" />
						Preview
					</button>
					<span className="ml-auto text-[10px] text-muted-foreground">
						Markdown
					</span>
				</div>
				{tab === "write" ? (
					<Textarea
						value={value}
						onChange={(e) => onChange(e.target.value)}
						rows={10}
						spellCheck={false}
						placeholder="# Hello world&#10;&#10;Type some **markdown** here…"
						className="min-h-[unset] resize-y rounded-none border-0 text-xs leading-relaxed shadow-none focus-visible:ring-0"
					/>
				) : html === null ? (
					<div className="flex min-h-[200px] items-center justify-center text-xs text-muted-foreground">
						Loading preview…
					</div>
				) : (
					<div
						className="prose prose-sm min-h-[200px] max-w-none px-4 py-3 text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-a:text-primary prose-a:underline prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs"
						dangerouslySetInnerHTML={{
							__html:
								html ||
								"<p class='text-muted-foreground'>Nothing to preview yet.</p>",
						}}
					/>
				)}
			</div>
		</div>
	);
}

// ─── 7. ReferenceField — pick another entry ──────────────────────────────────

export interface ReferenceOption {
	id: string;
	title: string;
	subtitle?: string;
	thumbnail?: string;
}

const DEMO_REFERENCES: ReferenceOption[] = [
	{
		id: "post-1",
		title: "How we redesigned the form editor",
		subtitle: "Article · 2026-05-01",
		thumbnail:
			"https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=80&auto=format&fit=crop&q=80",
	},
	{
		id: "post-2",
		title: "The case for fewer fields",
		subtitle: "Article · 2026-04-12",
	},
	{
		id: "page-home",
		title: "Home",
		subtitle: "Page · /",
	},
	{
		id: "page-pricing",
		title: "Pricing",
		subtitle: "Page · /pricing",
	},
	{
		id: "product-shoes",
		title: "Trail Runner GTX",
		subtitle: "Product · $189",
		thumbnail:
			"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=80&auto=format&fit=crop&q=80",
	},
	{
		id: "product-jacket",
		title: "Mountain Shell Jacket",
		subtitle: "Product · $329",
	},
	{
		id: "category-mens",
		title: "Men's apparel",
		subtitle: "Category · 142 products",
	},
];

export function ReferenceField({
	label,
	description,
	value,
	onChange,
	options = DEMO_REFERENCES,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
	options?: ReferenceOption[];
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const selected = options.find((o) => o.id === value);
	const filtered = query
		? options.filter(
				(o) =>
					o.title.toLowerCase().includes(query.toLowerCase()) ||
					o.subtitle?.toLowerCase().includes(query.toLowerCase()),
			)
		: options;

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex h-12 w-full items-center gap-3 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						{selected ? (
							<>
								{selected.thumbnail ? (
									<img
										src={selected.thumbnail}
										alt=""
										className="h-8 w-8 shrink-0 rounded object-cover"
									/>
								) : (
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
										<LinkIcon className="h-3.5 w-3.5" />
									</div>
								)}
								<div className="min-w-0 flex-1 text-left">
									<p className="truncate font-medium">{selected.title}</p>
									{selected.subtitle && (
										<p className="truncate text-xs text-muted-foreground">
											{selected.subtitle}
										</p>
									)}
								</div>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onChange("");
									}}
									className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							</>
						) : (
							<>
								<LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
								<span className="flex-1 text-left text-muted-foreground">
									Pick a reference…
								</span>
								<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							</>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-(--radix-popover-trigger-width) p-0"
					align="start"
				>
					<div className="border-b p-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search references…"
								className="h-9 pl-8 text-sm"
							/>
						</div>
					</div>
					<div className="max-h-72 overflow-y-auto p-1">
						{filtered.length === 0 ? (
							<div className="px-3 py-6 text-center text-xs text-muted-foreground">
								No results.
							</div>
						) : (
							filtered.map((o) => (
								<button
									key={o.id}
									type="button"
									onClick={() => {
										onChange(o.id);
										setOpen(false);
										setQuery("");
									}}
									className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-accent"
								>
									{o.thumbnail ? (
										<img
											src={o.thumbnail}
											alt=""
											className="h-8 w-8 shrink-0 rounded object-cover"
										/>
									) : (
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
											<LinkIcon className="h-3.5 w-3.5" />
										</div>
									)}
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{o.title}</p>
										{o.subtitle && (
											<p className="truncate text-xs text-muted-foreground">
												{o.subtitle}
											</p>
										)}
									</div>
									{value === o.id && (
										<Check className="h-4 w-4 shrink-0 text-primary" />
									)}
								</button>
							))
						)}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}

// ─── 8. RangeField — slider with numeric readout ─────────────────────────────

export function RangeField({
	label,
	description,
	value,
	onChange,
	min = 0,
	max = 100,
	step = 1,
	unit = "",
}: {
	label: string;
	description?: string;
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<FieldLabel label={label} description={description} />
				<span className="shrink-0 rounded-md border bg-muted/30 px-2 py-0.5 text-xs">
					{value}
					{unit}
				</span>
			</div>
			<div className="px-1 pt-1">
				<Slider
					value={[value]}
					min={min}
					max={max}
					step={step}
					onValueChange={(vs) => onChange(vs[0] ?? min)}
				/>
			</div>
			<div className="flex justify-between text-[10px] text-muted-foreground">
				<span>
					{min}
					{unit}
				</span>
				<span>
					{max}
					{unit}
				</span>
			</div>
		</div>
	);
}

// ─── 9. DateRangeField — from/to picker ──────────────────────────────────────

export function DateRangeField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: { from?: string; to?: string };
	onChange: (v: { from?: string; to?: string }) => void;
}) {
	const [open, setOpen] = useState(false);
	const fromDate = value?.from ? new Date(value.from) : undefined;
	const toDate = value?.to ? new Date(value.to) : undefined;

	const display =
		fromDate && toDate
			? `${formatDate(fromDate, "MMM d")} → ${formatDate(toDate, "MMM d, yyyy")}`
			: fromDate
				? `${formatDate(fromDate, "MMM d, yyyy")} → …`
				: "Select a range";

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className={cn(
							"flex h-10 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
							!fromDate && "text-muted-foreground",
						)}
					>
						<CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="flex-1 truncate text-left">{display}</span>
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="range"
						selected={fromDate ? { from: fromDate, to: toDate } : undefined}
						onSelect={(range) => {
							onChange({
								from: range?.from
									? formatDate(range.from, "yyyy-MM-dd")
									: undefined,
								to: range?.to ? formatDate(range.to, "yyyy-MM-dd") : undefined,
							});
						}}
						numberOfMonths={2}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}

// ─── 10. TimeField — custom popover with hour + minute columns ───────────────

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
	String(i * 5).padStart(2, "0"),
);

function parseTime(value: string): { h: string; m: string } | null {
	const m = /^(\d{1,2}):(\d{1,2})$/.exec(value || "");
	if (!m) return null;
	return {
		h: m[1].padStart(2, "0"),
		m: m[2].padStart(2, "0"),
	};
}

function normalizeTimeInput(raw: string): string | null {
	const cleaned = raw.replace(/[^\d:]/g, "");
	if (!cleaned) return null;
	let h: string;
	let m: string;
	if (cleaned.includes(":")) {
		const [hh, mm = ""] = cleaned.split(":");
		h = hh.padStart(2, "0");
		m = (mm || "00").padStart(2, "0");
	} else if (cleaned.length <= 2) {
		h = cleaned.padStart(2, "0");
		m = "00";
	} else {
		h = cleaned.slice(0, 2);
		m = cleaned.slice(2, 4).padStart(2, "0");
	}
	const hi = Number(h);
	const mi = Number(m);
	if (Number.isNaN(hi) || Number.isNaN(mi)) return null;
	if (hi < 0 || hi > 23 || mi < 0 || mi > 59) return null;
	return `${String(hi).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

export function TimeField({
	label,
	description,
	value,
	onChange,
	compact = false,
}: {
	label: string;
	description?: string;
	value: string;
	onChange: (v: string) => void;
	/** Compact mode hides the clock prefix block — for use next to a date picker */
	compact?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);

	const parsed = parseTime(value);
	const hourValue = parsed?.h ?? "";
	const minuteValue = parsed?.m ?? "";

	const setHour = (h: string) => {
		onChange(`${h}:${minuteValue || "00"}`);
	};
	const setMinute = (m: string) => {
		onChange(`${hourValue || "00"}:${m}`);
	};

	const commitDraft = () => {
		const normalized = normalizeTimeInput(draft);
		if (normalized) {
			onChange(normalized);
			setDraft(normalized);
		} else {
			setDraft(value);
		}
	};

	const inner = (
		<div className="flex h-10 w-full items-center rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
			{!compact && (
				<span className="flex h-full w-10 shrink-0 items-center justify-center border-r bg-muted/30 text-muted-foreground">
					<Clock className="h-4 w-4" />
				</span>
			)}
			<input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commitDraft}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						commitDraft();
						(e.target as HTMLInputElement).blur();
					}
				}}
				placeholder="HH:MM"
				inputMode="numeric"
				maxLength={5}
				className={cn(
					"min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground",
					compact ? "px-2.5 text-center" : "px-3",
				)}
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						title="Pick from list"
						className={cn(
							"flex h-full shrink-0 items-center border-l text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
							compact ? "px-1.5" : "px-2",
						)}
					>
						<ChevronDown className="h-3.5 w-3.5" />
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-48 p-0" align="end">
					<div className="grid grid-cols-2 divide-x">
						<TimeColumn
							label="Hour"
							options={HOURS}
							selected={hourValue}
							onSelect={setHour}
						/>
						<TimeColumn
							label="Minute"
							options={MINUTES}
							selected={minuteValue}
							onSelect={setMinute}
						/>
					</div>
					<div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5">
						<span className="text-xs text-muted-foreground">
							{value || "—"}
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-xs"
							onClick={() => setOpen(false)}
						>
							Done
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);

	if (compact) return inner;

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			{inner}
		</div>
	);
}

function TimeColumn({
	label,
	options,
	selected,
	onSelect,
}: {
	label: string;
	options: string[];
	selected: string;
	onSelect: (v: string) => void;
}) {
	return (
		<div className="flex flex-col">
			<div className="border-b px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="max-h-56 overflow-y-auto p-1">
				{options.map((opt) => {
					const active = opt === selected;
					return (
						<button
							key={opt}
							type="button"
							onClick={() => onSelect(opt)}
							className={cn(
								"flex w-full items-center justify-center rounded-sm py-1.5 text-sm transition-colors",
								active
									? "bg-primary text-primary-foreground"
									: "text-foreground hover:bg-accent",
							)}
						>
							{opt}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ─── 11. IconField — pick from Lucide library ───────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
	Award,
	Bell,
	Bike,
	Bookmark,
	Bus,
	Calendar: CalendarIcon,
	Camera,
	Car,
	Check,
	Clock,
	Cloud,
	Coffee,
	Cookie,
	CreditCard,
	Download,
	Eye,
	EyeOff,
	Flag,
	Gift,
	Globe,
	Headphones,
	Heart,
	Home,
	Image,
	Link: LinkIcon,
	Lock,
	Mail,
	MapPin,
	MessageCircle,
	Mic,
	Minus,
	Moon,
	Music,
	Package,
	Phone,
	Pizza,
	Plane,
	Plus,
	Search,
	Send,
	Settings,
	Share,
	Shield,
	ShoppingBag,
	ShoppingCart,
	Smile,
	Star,
	Sun,
	Tag,
	ThumbsUp,
	Train,
	Trophy,
	Truck,
	Upload,
	User,
	Users,
	Utensils,
	Video,
	X,
	Zap,
};
const POPULAR_ICONS = Object.keys(ICON_MAP);

export function IconField({
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
	const [query, setQuery] = useState("");

	const Selected = ICON_MAP[value];
	const filtered = query
		? POPULAR_ICONS.filter((n) => n.toLowerCase().includes(query.toLowerCase()))
		: POPULAR_ICONS;

	return (
		<div className="space-y-2">
			<FieldLabel label={label} description={description} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex h-10 w-full items-center gap-3 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-muted/30">
							{Selected ? (
								<Selected className="h-4 w-4" />
							) : (
								<span className="text-xs text-muted-foreground/60">?</span>
							)}
						</span>
						<span className="flex-1 truncate text-left font-mono">
							{value || <span className="text-muted-foreground">No icon</span>}
						</span>
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-(--radix-popover-trigger-width) p-0"
					align="start"
				>
					<div className="border-b p-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search icons…"
								className="h-9 pl-8 text-sm"
							/>
						</div>
					</div>
					<div className="grid max-h-64 grid-cols-7 gap-1 overflow-y-auto p-2">
						{filtered.map((name) => {
							const Icon = ICON_MAP[name];
							if (!Icon) return null;
							const active = value === name;
							return (
								<button
									key={name}
									type="button"
									title={name}
									onClick={() => {
										onChange(name);
										setOpen(false);
									}}
									className={cn(
										"flex aspect-square items-center justify-center rounded-md border transition-colors",
										active
											? "border-primary bg-primary/10 text-primary"
											: "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
									)}
								>
									<Icon className="h-4 w-4" />
								</button>
							);
						})}
					</div>
					{value && (
						<div className="border-t p-2">
							<Button
								variant="ghost"
								size="sm"
								className="w-full text-xs text-muted-foreground"
								onClick={() => {
									onChange("");
									setOpen(false);
								}}
							>
								<X className="mr-1.5 h-3 w-3" />
								Clear icon
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}
