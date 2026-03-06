import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const ASSETS_RESOURCE_URI = "ui://mcp-app/assets";

const ADMIN_BASE_URL =
	process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

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
		.default(50)
		.describe("Number of assets to return (default: 50)"),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe("Offset for pagination (default: 0)"),
});

export type AssetsInput = z.infer<typeof assetsInputSchema>;

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

export const uploadConfigSchema = z.object({
	endpoint: z.string().describe("Admin API upload endpoint URL"),
	apiKey: z.string().describe("API key for the admin upload endpoint"),
	sitename: z.string().describe("Site name for the upload"),
});

export type UploadConfig = z.infer<typeof uploadConfigSchema>;

export const deleteConfigSchema = z.object({
	endpoint: z.string().describe("Admin API delete endpoint URL"),
	apiKey: z.string().describe("API key for the admin delete endpoint"),
	sitename: z.string().describe("Site name for the delete"),
});

export type DeleteConfig = z.infer<typeof deleteConfigSchema>;

export const assetsOutputSchema = z.object({
	assets: z.array(assetSchema),
	sitename: z.string(),
	total: z.number(),
	uploadConfig: uploadConfigSchema,
	deleteConfig: deleteConfigSchema,
});

export type AssetsOutput = z.infer<typeof assetsOutputSchema>;

export const assetsTool = (env: Env) =>
	createTool({
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
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { term, limit = 50, offset = 0 } = context;

			const state = env.MESH_REQUEST_CONTEXT?.state;
			const apiKey = state?.DECO_ADMIN_API_KEY;
			const sitename = state?.SITE_NAME;

			if (!sitename) {
				throw new Error(
					"SITE_NAME is not configured. Set it in the MCP configuration.",
				);
			}

			if (!apiKey) {
				throw new Error(
					"DECO_ADMIN_API_KEY is not configured. Set it in the MCP configuration.",
				);
			}

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
				uploadConfig: {
					endpoint: `${ADMIN_BASE_URL}/live/invoke/deco-sites/admin/actions/assets/upload.ts`,
					apiKey,
					sitename,
				},
				deleteConfig: {
					endpoint: `${ADMIN_BASE_URL}/live/invoke/deco-sites/admin/actions/assets/remove_asset.ts`,
					apiKey,
					sitename,
				},
			};
		},
	});
