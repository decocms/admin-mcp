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
	IS_SORT_OPTIONS,
	NumberField,
	SortField,
	TextField,
	VtexLogo,
	VtexStringArrayEditor,
} from "./shared.tsx";

export const IS_PRODUCT_LIST_RESOLVE_TYPE =
	"vtex/loaders/intelligentSearch/productList.ts";

type ISMode = "collection" | "query" | "productIds" | "facets";

const IS_MODES: Array<{
	id: ISMode;
	label: string;
	description: string;
}> = [
	{
		id: "query",
		label: "Query",
		description: "Find products by a search query.",
	},
	{
		id: "collection",
		label: "Collection",
		description: "Fetch products from a collection.",
	},
	{
		id: "productIds",
		label: "Product IDs",
		description: "Retrieve specific products by their identifiers.",
	},
	{
		id: "facets",
		label: "Facets",
		description: "Filter products using facet queries.",
	},
];

export function detectISMode(props: Record<string, FormValue>): ISMode {
	if ("ids" in props) return "productIds";
	if ("facets" in props) return "facets";
	if ("collection" in props) return "collection";
	return "query";
}

function emptyPropsForMode(mode: ISMode): Record<string, FormValue> {
	switch (mode) {
		case "query":
			return { query: "", sort: "", count: 12 };
		case "collection":
			return { collection: "", sort: "", count: 12 };
		case "productIds":
			return { ids: [] };
		case "facets":
			return { facets: "", sort: "", count: 12 };
	}
}

export function isModeSummary(
	mode: ISMode,
	props: Record<string, FormValue>,
): string {
	switch (mode) {
		case "query": {
			const q = props.query as string | undefined;
			return q ? `"${q}"` : "No query set";
		}
		case "collection": {
			const col = props.collection as string | undefined;
			return col ? `Collection ${col}` : "No collection set";
		}
		case "productIds": {
			const ids = (props.ids as string[] | undefined) ?? [];
			return ids.length > 0
				? `${ids.length} product${ids.length > 1 ? "s" : ""}`
				: "No products set";
		}
		case "facets": {
			const f = props.facets as string | undefined;
			return f ? f : "No facets set";
		}
	}
}

export function isModeLabel(props: Record<string, FormValue>): string {
	const mode = detectISMode(props);
	return IS_MODES.find((m) => m.id === mode)?.label ?? mode;
}

export function VtexISProductListModal({
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
	const [mode, setMode] = useState<ISMode>(() => detectISMode(props));
	const [draft, setDraft] = useState<Record<string, FormValue>>(() => ({
		...props,
	}));

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset draft on open
	useEffect(() => {
		if (open) {
			const m = detectISMode(props);
			setMode(m);
			setDraft({ ...props });
		}
	}, [open]);

	const handleModeChange = (newMode: ISMode) => {
		if (newMode === mode) return;
		const next = emptyPropsForMode(newMode);
		// carry over shared fields
		if ("sort" in draft && "sort" in next) next.sort = draft.sort ?? "";
		if ("count" in draft && "count" in next)
			next.count = (draft.count as number) ?? 12;
		// carry over common advanced fields
		if ("hideUnavailableItems" in draft)
			next.hideUnavailableItems = draft.hideUnavailableItems;
		if ("similars" in draft) next.similars = draft.similars;
		setMode(newMode);
		setDraft(next);
	};

	const update = (key: string, val: FormValue) =>
		setDraft((d) => ({ ...d, [key]: val }));

	const sortVal = (draft.sort as string) ?? "";
	const countVal = (draft.count as number) ?? 12;
	const hasSort = mode !== "productIds";
	const hasCount = mode !== "productIds";

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex max-h-[85vh] w-[500px] flex-col gap-0 p-0 overflow-hidden">
				{/* Header */}
				<div className="shrink-0 border-b px-5 py-4 bg-[#F71963]/5">
					<div className="flex items-center gap-3">
						<VtexLogo />
						<div className="min-w-0">
							<p className="text-sm font-semibold leading-none text-foreground">
								IS Product List
							</p>
							<p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
								vtex/loaders/intelligentSearch/productList.ts
							</p>
						</div>
					</div>
				</div>

				{/* Mode tabs */}
				<div className="shrink-0 border-b bg-muted/30 px-5">
					<div className="flex gap-0 overflow-x-auto">
						{IS_MODES.map((m) => (
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
							{IS_MODES.find((m) => m.id === mode)?.description}
						</p>

						{mode === "query" && (
							<>
								<TextField
									label="Query"
									description="Search query string"
									value={(draft.query as string) ?? ""}
									onChange={(v) => update("query", v)}
								/>
								<TextField
									label="Fuzzy"
									description='Fuzzy search mode ("0", "1", "auto")'
									value={(draft.fuzzy as string) ?? ""}
									onChange={(v) => update("fuzzy", v)}
								/>
							</>
						)}

						{mode === "collection" && (
							<TextField
								label="Collection"
								description="Collection ID or name"
								value={(draft.collection as string) ?? ""}
								onChange={(v) => update("collection", v)}
							/>
						)}

						{mode === "productIds" && (
							<VtexStringArrayEditor
								label="Product IDs"
								description="List of product identifiers to retrieve"
								value={(draft.ids as string[]) ?? []}
								placeholder="e.g. 12345"
								onChange={(v) => update("ids", v)}
							/>
						)}

						{mode === "facets" && (
							<>
								<TextField
									label="Facets"
									description="Facet query string"
									value={(draft.facets as string) ?? ""}
									onChange={(v) => update("facets", v)}
								/>
								<TextField
									label="Query"
									description="Optional search query"
									value={(draft.query as string) ?? ""}
									onChange={(v) => update("query", v)}
								/>
							</>
						)}

						{hasSort && (
							<SortField
								value={sortVal}
								options={IS_SORT_OPTIONS}
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

						{/* Common advanced fields */}
						<CheckboxField
							label="Hide Unavailable Items"
							description="Remove out-of-stock products from the results"
							value={(draft.hideUnavailableItems as boolean) ?? false}
							onChange={(v) => update("hideUnavailableItems", v)}
						/>
						<CheckboxField
							label="Include Similar Products"
							description="Include similar / related products"
							value={(draft.similars as boolean) ?? false}
							onChange={(v) => update("similars", v)}
						/>
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
