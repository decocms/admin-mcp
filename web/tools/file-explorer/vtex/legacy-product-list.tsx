import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogFooter,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";
import {
	CheckboxField,
	type FormValue,
	LEGACY_SORT_OPTIONS,
	NumberField,
	SortField,
	TextField,
	VtexLogo,
	VtexStringArrayEditor,
} from "./shared.tsx";

export const LEGACY_PRODUCT_LIST_RESOLVE_TYPE =
	"vtex/loaders/legacy/productList.ts";

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

export function detectLegacyMode(props: Record<string, FormValue>): VtexMode {
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

export function legacyModeSummary(
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

export function legacyModeLabel(props: Record<string, FormValue>): string {
	const mode = detectLegacyMode(props);
	return VTEX_MODES.find((m) => m.id === mode)?.label ?? mode;
}

export function VtexLegacyProductListModal({
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
	const [mode, setMode] = useState<VtexMode>(() => detectLegacyMode(props));
	const [draft, setDraft] = useState<Record<string, FormValue>>(() => ({
		...props,
	}));

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset draft on open
	useEffect(() => {
		if (open) {
			const m = detectLegacyMode(props);
			setMode(m);
			setDraft({ ...props });
		}
	}, [open]);

	const handleModeChange = (newMode: VtexMode) => {
		if (newMode === mode) return;
		const next = emptyPropsForMode(newMode);
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
				<div className="overflow-y-auto max-h-[60vh]">
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
							<SortField
								value={sortVal}
								options={LEGACY_SORT_OPTIONS}
								onChange={(v) => update("sort", v)}
							/>
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
								description="Include similar / related products (deprecated \u2014 prefer product extensions)"
								value={similarsVal}
								onChange={(v) => update("similars", v)}
							/>
						)}
					</div>
				</div>

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
