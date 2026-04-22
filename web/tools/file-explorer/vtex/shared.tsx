import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select.tsx";
import type { FormValue } from "../cms-form.tsx";
import {
	CheckboxField as _CheckboxField,
	FieldLabel as _FieldLabel,
	NumberField as _NumberField,
	TextField as _TextField,
} from "../cms-form.tsx";

export type { FormValue };

// Re-export field helpers used by every VTEX modal
export const FieldLabel = _FieldLabel;
export const TextField = _TextField;
export const NumberField = _NumberField;
export const CheckboxField = _CheckboxField;

// Sentinel used in place of "" since Radix Select forbids empty-string values
export const EMPTY_SENTINEL = "__empty__";

// ─── VTEX logo ───────────────────────────────────────────────────────────────

export function VtexLogo() {
	return (
		<img
			src="https://assets.decocache.com/admin/ebf5f465-021c-4279-ad6f-f2789d103cd4/vtex.png"
			alt="VTEX"
			className="h-5 shrink-0 object-contain"
		/>
	);
}

// ─── string array editor ─────────────────────────────────────────────────────

export function VtexStringArrayEditor({
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

// ─── key-value array editor ──────────────────────────────────────────────────

export type KeyValuePair = { key: string; value: string };

export function VtexKeyValueArrayEditor({
	label,
	description,
	value,
	keyPlaceholder = "key",
	valuePlaceholder = "value",
	onChange,
}: {
	label: string;
	description?: string;
	value: KeyValuePair[];
	keyPlaceholder?: string;
	valuePlaceholder?: string;
	onChange: (v: KeyValuePair[]) => void;
}) {
	return (
		<div className="space-y-1.5">
			<FieldLabel label={label} description={description} />
			<div className="space-y-1.5">
				{value.map((item, i) => (
					<div key={i} className="flex gap-1.5 items-center">
						<Input
							value={item.key}
							onChange={(e) => {
								const next = [...value];
								next[i] = { ...next[i], key: e.target.value };
								onChange(next);
							}}
							placeholder={keyPlaceholder}
							className="h-7 text-xs flex-1"
						/>
						<Input
							value={item.value}
							onChange={(e) => {
								const next = [...value];
								next[i] = { ...next[i], value: e.target.value };
								onChange(next);
							}}
							placeholder={valuePlaceholder}
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
					onClick={() => onChange([...value, { key: "", value: "" }])}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
				>
					<Plus className="h-3 w-3" />
					Add facet
				</button>
			</div>
		</div>
	);
}

// ─── sort field helper ───────────────────────────────────────────────────────

export function SortField({
	value,
	options,
	onChange,
}: {
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (v: string) => void;
}) {
	return (
		<div className="space-y-1">
			<FieldLabel label="Sort" description="Product sort order" />
			<Select
				value={value === "" ? EMPTY_SENTINEL : value}
				onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}
			>
				<SelectTrigger className="h-7 text-xs">
					<SelectValue placeholder="Relevance" />
				</SelectTrigger>
				<SelectContent>
					{options.map((opt) => (
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
	);
}

// ─── shared sort option sets ─────────────────────────────────────────────────

export const LEGACY_SORT_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "", label: "Relevance" },
	{ value: "OrderByScoreDESC", label: "Score" },
	{ value: "OrderByPriceDESC", label: "Price: High \u2192 Low" },
	{ value: "OrderByPriceASC", label: "Price: Low \u2192 High" },
	{ value: "OrderByTopSaleDESC", label: "Top Sales" },
	{ value: "OrderByReviewRateDESC", label: "Review Rate" },
	{ value: "OrderByNameDESC", label: "Name: Z \u2192 A" },
	{ value: "OrderByNameASC", label: "Name: A \u2192 Z" },
	{ value: "OrderByReleaseDateDESC", label: "Release Date" },
	{ value: "OrderByBestDiscountDESC", label: "Best Discount" },
];

export const IS_SORT_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "", label: "Relevance" },
	{ value: "price:desc", label: "Price: High \u2192 Low" },
	{ value: "price:asc", label: "Price: Low \u2192 High" },
	{ value: "orders:desc", label: "Top Sales" },
	{ value: "name:desc", label: "Name: Z \u2192 A" },
	{ value: "name:asc", label: "Name: A \u2192 Z" },
	{ value: "release:desc", label: "Release Date" },
	{ value: "discount:desc", label: "Best Discount" },
];
