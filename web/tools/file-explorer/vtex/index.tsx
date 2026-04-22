import {
	detectISMode,
	IS_PRODUCT_LIST_RESOLVE_TYPE,
	isModeLabel,
	isModeSummary,
	VtexISProductListModal,
} from "./is-product-list.tsx";
import {
	IS_PLP_RESOLVE_TYPE,
	isPlpSummary,
	VtexISProductListingPageModal,
} from "./is-product-listing-page.tsx";
import {
	detectLegacyMode,
	LEGACY_PRODUCT_LIST_RESOLVE_TYPE,
	legacyModeLabel,
	legacyModeSummary,
	VtexLegacyProductListModal,
} from "./legacy-product-list.tsx";
import {
	LEGACY_PLP_RESOLVE_TYPE,
	legacyPlpSummary,
	VtexLegacyProductListingPageModal,
} from "./legacy-product-listing-page.tsx";
import { type FormValue, VtexLogo } from "./shared.tsx";

// ─── resolve type matching ───────────────────────────────────────────────────

const VTEX_RESOLVE_TYPES = new Set([
	LEGACY_PRODUCT_LIST_RESOLVE_TYPE,
	IS_PRODUCT_LIST_RESOLVE_TYPE,
	IS_PLP_RESOLVE_TYPE,
	LEGACY_PLP_RESOLVE_TYPE,
]);

function matchResolveType(resolveType: string, target: string): boolean {
	return resolveType === target || resolveType.endsWith(`/${target}`);
}

export function isVtexLoader(resolveType: string): boolean {
	for (const rt of VTEX_RESOLVE_TYPES) {
		if (matchResolveType(resolveType, rt)) return true;
	}
	return false;
}

// ─── button summary ──────────────────────────────────────────────────────────

function getSummary(
	resolveType: string,
	props: Record<string, FormValue>,
): { label: string; summary: string } {
	if (matchResolveType(resolveType, LEGACY_PRODUCT_LIST_RESOLVE_TYPE)) {
		return {
			label: legacyModeLabel(props),
			summary: legacyModeSummary(detectLegacyMode(props), props),
		};
	}
	if (matchResolveType(resolveType, IS_PRODUCT_LIST_RESOLVE_TYPE)) {
		return {
			label: isModeLabel(props),
			summary: isModeSummary(detectISMode(props), props),
		};
	}
	if (matchResolveType(resolveType, IS_PLP_RESOLVE_TYPE)) {
		return {
			label: "IS Product Listing Page",
			summary: isPlpSummary(props),
		};
	}
	if (matchResolveType(resolveType, LEGACY_PLP_RESOLVE_TYPE)) {
		return {
			label: "Legacy Product Listing Page",
			summary: legacyPlpSummary(props),
		};
	}
	return { label: "VTEX Loader", summary: "" };
}

// ─── VTEX loader button ─────────────────────────────────────────────────────

export function VtexLoaderButton({
	resolveType,
	props,
	onClick,
}: {
	resolveType: string;
	props: Record<string, FormValue>;
	onClick: () => void;
}) {
	const { label, summary } = getSummary(resolveType, props);
	return (
		<button
			type="button"
			onClick={onClick}
			className="group flex w-full items-center gap-2.5 rounded-md border border-[#F71963]/30 bg-[#F71963]/5 px-3 py-2 text-left transition-colors hover:bg-[#F71963]/10"
		>
			<VtexLogo />
			<div className="min-w-0 flex-1">
				<p className="text-[11px] font-medium text-foreground leading-none">
					{label}
				</p>
				<p className="text-[10px] text-muted-foreground mt-0.5 truncate">
					{summary}
				</p>
			</div>
			<span className="shrink-0 text-[10px] text-[#F71963]/70 group-hover:text-[#F71963] transition-colors">
				configure ↗
			</span>
		</button>
	);
}

// ─── VTEX loader modal router ────────────────────────────────────────────────

export function VtexLoaderModal({
	resolveType,
	open,
	onClose,
	props,
	onSave,
}: {
	resolveType: string;
	open: boolean;
	onClose: () => void;
	props: Record<string, FormValue>;
	onSave: (newProps: Record<string, FormValue>) => void;
}) {
	if (matchResolveType(resolveType, LEGACY_PRODUCT_LIST_RESOLVE_TYPE)) {
		return (
			<VtexLegacyProductListModal
				open={open}
				onClose={onClose}
				props={props}
				onSave={onSave}
			/>
		);
	}
	if (matchResolveType(resolveType, IS_PRODUCT_LIST_RESOLVE_TYPE)) {
		return (
			<VtexISProductListModal
				open={open}
				onClose={onClose}
				props={props}
				onSave={onSave}
			/>
		);
	}
	if (matchResolveType(resolveType, IS_PLP_RESOLVE_TYPE)) {
		return (
			<VtexISProductListingPageModal
				open={open}
				onClose={onClose}
				props={props}
				onSave={onSave}
			/>
		);
	}
	if (matchResolveType(resolveType, LEGACY_PLP_RESOLVE_TYPE)) {
		return (
			<VtexLegacyProductListingPageModal
				open={open}
				onClose={onClose}
				props={props}
				onSave={onSave}
			/>
		);
	}
	return null;
}
