import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
	CheckboxField,
	type FormValue,
	IS_SORT_OPTIONS,
	type KeyValuePair,
	NumberField,
	SortField,
	TextField,
	VtexKeyValueArrayEditor,
	VtexLogo,
} from "./shared.tsx";

export const IS_PLP_RESOLVE_TYPE =
	"vtex/loaders/intelligentSearch/productListingPage.ts";

export function VtexISProductListingPageModal({
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
	const [draft, setDraft] = useState<Record<string, FormValue>>(() => ({
		...props,
	}));

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset draft on open
	useEffect(() => {
		if (open) {
			setDraft({ ...props });
		}
	}, [open]);

	const update = (key: string, val: FormValue) =>
		setDraft((d) => ({ ...d, [key]: val }));

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex max-h-[85vh] w-[500px] flex-col gap-0 p-0 overflow-hidden">
				{/* Header */}
				<div className="shrink-0 border-b px-5 py-4 bg-[#F71963]/5">
					<div className="flex items-center gap-3">
						<VtexLogo />
						<div className="min-w-0">
							<p className="text-sm font-semibold leading-none text-foreground">
								IS Product Listing Page
							</p>
							<p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
								vtex/loaders/intelligentSearch/productListingPage.ts
							</p>
						</div>
					</div>
				</div>

				{/* Fields */}
				<div className="overflow-y-auto max-h-[60vh]">
					<div className="px-5 py-4 space-y-4">
						<TextField
							label="Query"
							description="Search query string"
							value={(draft.query as string) ?? ""}
							onChange={(v) => update("query", v)}
						/>

						<NumberField
							label="Count"
							description="Number of products per page"
							value={(draft.count as number) ?? 12}
							onChange={(v) => update("count", v)}
						/>

						<SortField
							value={(draft.sort as string) ?? ""}
							options={IS_SORT_OPTIONS}
							onChange={(v) => update("sort", v)}
						/>

						<TextField
							label="Fuzzy"
							description='Fuzzy search mode ("0", "1", "auto")'
							value={(draft.fuzzy as string) ?? ""}
							onChange={(v) => update("fuzzy", v)}
						/>

						<VtexKeyValueArrayEditor
							label="Selected Facets"
							description="Facet filters applied to the listing (e.g. key=category-1, value=shoes)"
							value={(draft.selectedFacets as KeyValuePair[] | undefined) ?? []}
							keyPlaceholder="e.g. category-1"
							valuePlaceholder="e.g. shoes"
							onChange={(v) =>
								update("selectedFacets", v as unknown as FormValue)
							}
						/>

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

						<NumberField
							label="Page Offset"
							description="Starting page offset"
							value={(draft.pageOffset as number) ?? 0}
							onChange={(v) => update("pageOffset", v)}
						/>

						<CheckboxField
							label="Use Collection Name"
							description="Use collection name as breadcrumb"
							value={(draft.useCollectionName as boolean) ?? false}
							onChange={(v) => update("useCollectionName", v)}
						/>

						<TextField
							label="Simulation Behavior"
							description='Simulation behavior ("skip", "only1P", "default")'
							value={(draft.simulationBehavior as string) ?? ""}
							onChange={(v) => update("simulationBehavior", v)}
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

export function isPlpSummary(props: Record<string, FormValue>): string {
	const q = props.query as string | undefined;
	if (q) return `"${q}"`;
	const count = props.count as number | undefined;
	if (count) return `${count} items`;
	return "Default settings";
}
