import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { ADMIN_BASE_URL, getConfig } from "../lib/admin.ts";

export const ASSETS_RESOURCE_URI = "ui://mcp-app/assets";

// ─── shared schema ────────────────────────────────────────────────────────────

export const assetSchema = z.object({
	id: z.number(),
	asset_id: z.string().nullable(),
	site_id: z.number(),
	publicUrl: z.string(),
	label: z.string().nullable(),
	mime: z.string().nullable(),
	path: z.string(),
	brightness: z.number().nullable(),
	preview: z.string().nullable(),
	created_at: z.string(),
	updated_at: z.string(),
});

export type Asset = z.infer<typeof assetSchema>;

// ─── fetch_assets ─────────────────────────────────────────────────────────────

export const assetsInputSchema = z.object({
	term: z
		.string()
		.optional()
		.describe("Optional search term to filter assets by label"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.default(47)
		.describe("Number of assets to return (default: 50)"),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe("Offset for pagination (default: 0)"),
});

export type AssetsInput = z.infer<typeof assetsInputSchema>;

export const assetsOutputSchema = z.object({
	assets: z.array(assetSchema),
	sitename: z.string(),
	total: z.number(),
});

export type AssetsOutput = z.infer<typeof assetsOutputSchema>;

export const assetsTool = createTool({
	id: "fetch_assets",
	description:
		"Fetch media assets (images, videos, documents, fonts) for the configured deco.cx site. Returns a paginated gallery of all uploaded assets with URLs, labels, and MIME types. Supports optional search by filename.",
	inputSchema: assetsInputSchema,
	outputSchema: assetsOutputSchema,
	_meta: { ui: { resourceUri: ASSETS_RESOURCE_URI } },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { term, limit = 42, offset = 0 } = context;
		const { site: sitename, apiKey } = getConfig(ctx);

		const response = await fetch(
			`${ADMIN_BASE_URL}/live/invoke/deco-sites/admin/loaders/sites/assets.ts`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					sitename,
					filters: { offset, limit },
					...(term ? { term } : {}),
				}),
			},
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch assets: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		const assets: Asset[] = data.assets ?? [];

		return {
			assets,
			sitename,
			total: assets.length,
		};
	},
});

// ─── upload_asset ─────────────────────────────────────────────────────────────

export const uploadAssetInputSchema = z.object({
	url: z
		.string()
		.url()
		.optional()
		.describe(
			"Public URL of the file to fetch and upload as a site asset. Provide either url or data, not both.",
		),
	data: z
		.string()
		.optional()
		.describe(
			"Base64-encoded file content to upload directly (alternative to url, for local files).",
		),
	mimeType: z
		.string()
		.optional()
		.describe("MIME type of the file. Required when using data."),
	filename: z
		.string()
		.optional()
		.describe(
			"Custom filename for the asset. Defaults to the filename extracted from the URL.",
		),
});

export type UploadAssetInput = z.infer<typeof uploadAssetInputSchema>;

export const uploadAssetOutputSchema = z.object({
	asset: assetSchema,
	message: z.string(),
});

export type UploadAssetOutput = z.infer<typeof uploadAssetOutputSchema>;

function filenameFromUrl(url: string): string {
	try {
		const pathname = new URL(url).pathname;
		const name = pathname.split("/").pop();
		return name?.includes(".") ? name : "asset";
	} catch {
		return "asset";
	}
}

export const uploadAssetTool = createTool({
	id: "upload_asset",
	description:
		"Upload a media asset for the configured deco.cx site. Accepts either a public URL (the server downloads it) or base64-encoded file content. Returns the uploaded asset with its CDN URL.",
	inputSchema: uploadAssetInputSchema,
	outputSchema: uploadAssetOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { url, data, mimeType, filename } = context;
		const { site: sitename, apiKey } = getConfig(ctx);

		if (!url && !data) {
			throw new Error("Either url or data must be provided.");
		}

		let fileBlob: Blob;
		let contentType: string;
		let name: string;

		if (data) {
			const binary = atob(data);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			contentType = mimeType ?? "application/octet-stream";
			name = filename ?? "asset";
			fileBlob = new Blob([bytes], { type: contentType });
		} else {
			const resolvedUrl = url as string;
			const fetchResponse = await fetch(resolvedUrl);
			if (!fetchResponse.ok) {
				throw new Error(
					`Failed to fetch file from URL: ${fetchResponse.status} ${fetchResponse.statusText}`,
				);
			}
			fileBlob = await fetchResponse.blob();
			contentType =
				fetchResponse.headers.get("content-type") ??
				fileBlob.type ??
				"application/octet-stream";
			name = filename ?? filenameFromUrl(resolvedUrl);
		}

		const form = new FormData();
		form.append("sitename", sitename);
		form.append(
			"file",
			new File([fileBlob], name, { type: contentType }),
			name,
		);

		const uploadResponse = await fetch(
			`${ADMIN_BASE_URL}/live/invoke/deco-sites/admin/actions/assets/upload.ts`,
			{
				method: "POST",
				headers: { "x-api-key": apiKey },
				body: form,
			},
		);

		if (!uploadResponse.ok) {
			const text = await uploadResponse
				.text()
				.catch(() => uploadResponse.statusText);
			throw new Error(`Upload failed: ${uploadResponse.status} — ${text}`);
		}

		const asset = await uploadResponse.json();

		return {
			asset,
			message: `Successfully uploaded "${name}" to ${sitename}. CDN URL: ${asset.publicUrl}`,
		};
	},
});

// ─── delete_asset ─────────────────────────────────────────────────────────────

export const deleteAssetInputSchema = z.object({
	id: z
		.string()
		.describe("The numeric ID of the asset to delete (as a string, e.g. '42')"),
});

export const deleteAssetOutputSchema = z.object({
	deleted: z.boolean(),
	id: z.string(),
	sitename: z.string(),
	message: z.string(),
});

export type DeleteAssetOutput = z.infer<typeof deleteAssetOutputSchema>;

export const deleteAssetTool = createTool({
	id: "delete_asset",
	description:
		"Permanently delete a media asset by its ID from the configured deco.cx site. This is irreversible — the file is removed from storage and the database index.",
	inputSchema: deleteAssetInputSchema,
	outputSchema: deleteAssetOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }, ctx) => {
		const { id } = context;
		const { site: sitename, apiKey } = getConfig(ctx);

		const response = await fetch(
			`${ADMIN_BASE_URL}/live/invoke/deco-sites/admin/actions/assets/remove_asset.ts`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ sitename, id }),
			},
		);

		if (!response.ok) {
			const text = await response.text().catch(() => response.statusText);
			throw new Error(
				`Failed to delete asset ${id}: ${response.status} ${text}`,
			);
		}

		return {
			deleted: true,
			id,
			sitename,
			message: `Asset ${id} deleted successfully from ${sitename}.`,
		};
	},
});
