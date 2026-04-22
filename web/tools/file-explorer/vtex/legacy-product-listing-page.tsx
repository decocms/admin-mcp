import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select.tsx";
import {
	CheckboxField,
	EMPTY_SENTINEL,
	FieldLabel,
	type FormValue,
	LEGACY_SORT_OPTIONS,
	NumberField,
	SortField,
	TextField,
	VtexLogo,
	VtexStringArrayEditor,
} from "./shared.tsx";

export const LEGACY_PLP_RESOLVE_TYPE =
	"vtex/loaders/legacy/productListingPage.ts";

export function VtexLegacyProductListingPageModal({
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

	const filtersVal = (draft.filters as string) ?? "";

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex max-h-[85vh] w-[500px] flex-col gap-0 p-0 overflow-hidden">
				{/* Header */}
				<div className="shrink-0 border-b px-5 py-4 bg-[#F71963]/5">
					<div className="flex items-center gap-3">
						<VtexLogo />
						<div className="min-w-0">
							<p className="text-sm font-semibold leading-none text-foreground">
								Legacy Product Listing Page
							</p>
							<p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
								vtex/loaders/legacy/productListingPage.ts
							</p>
						</div>
					</div>
				</div>

				{/* Fields */}
				<div className="overflow-y-auto max-h-[60vh]">
					<div className="px-5 py-4 space-y-4">
						<TextField
							label="Term"
							description="Search term for the product listing"
							value={(draft.term as string) ?? ""}
							onChange={(v) => update("term", v)}
						/>

						<NumberField
							label="Count"
							description="Number of products per page"
							value={(draft.count as number) ?? 12}
							onChange={(v) => update("count", v)}
						/>

						<TextField
							label="Full Text (ft)"
							description="Full-text search query"
							value={(draft.ft as string) ?? ""}
							onChange={(v) => update("ft", v)}
						/>

						<VtexStringArrayEditor
							label="Facet Queries (fq)"
							description='VTEX filter queries, e.g. "C:/1/2/" or "specificationFilter_123:value"'
							value={(draft.fq as string[]) ?? []}
							placeholder="e.g. C:/1/2/"
							onChange={(v) => update("fq", v)}
						/>

						<TextField
							label="Map"
							description="Map parameter for category/brand navigation"
							value={(draft.map as string) ?? ""}
							onChange={(v) => update("map", v)}
						/>

						<SortField
							value={(draft.sort as string) ?? ""}
							options={LEGACY_SORT_OPTIONS}
							onChange={(v) => update("sort", v)}
						/>

						<div className="space-y-1">
							<FieldLabel label="Filters" description="Filter strategy" />
							<Select
								value={filtersVal === "" ? EMPTY_SENTINEL : filtersVal}
								onValueChange={(v) =>
									update("filters", v === EMPTY_SENTINEL ? "" : v)
								}
							>
								<SelectTrigger className="h-7 text-xs">
									<SelectValue placeholder="Default" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={EMPTY_SENTINEL} className="text-xs">
										\u2014
									</SelectItem>
									<SelectItem value="dynamic" className="text-xs">
										Dynamic
									</SelectItem>
									<SelectItem value="static" className="text-xs">
										Static
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

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

						<CheckboxField
							label="Include Similar Products"
							description="Include similar / related products"
							value={(draft.similars as boolean) ?? false}
							onChange={(v) => update("similars", v)}
						/>

						<CheckboxField
							label="Ignore Case Selected"
							description="Ignore case sensitivity for selected facets"
							value={(draft.ignoreCaseSelected as boolean) ?? false}
							onChange={(v) => update("ignoreCaseSelected", v)}
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

export function legacyPlpSummary(props: Record<string, FormValue>): string {
	const term = props.term as string | undefined;
	if (term) return `"${term}"`;
	const count = props.count as number | undefined;
	if (count) return `${count} items`;
	return "Default settings";
}
