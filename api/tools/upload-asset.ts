import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { assetSchema, ASSETS_RESOURCE_URI } from "./assets.ts";
import type { Env } from "../types/env.ts";

const ADMIN_BASE_URL =
	process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

export const uploadAssetInputSchema = z.object({
	url: z
		.string()
		.url()
		.describe(
			"Public URL of the file to fetch and upload as a site asset. Supports images, videos, documents, fonts, and other file types.",
		),
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
		return name && name.includes(".") ? name : "asset";
	} catch {
		return "asset";
	}
}

export const uploadAssetTool = (env: Env) =>
	createTool({
		id: "upload_asset",
		description:
			"Download a file from a public URL and upload it as a media asset for the configured deco.cx site. Use this to save images, videos, documents or any file to the site's asset library. Returns the uploaded asset with its CDN URL.",
		inputSchema: uploadAssetInputSchema,
		outputSchema: uploadAssetOutputSchema,
		_meta: { ui: { resourceUri: ASSETS_RESOURCE_URI } },
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { url, filename } = context;

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

			// Fetch the file from the provided URL
			const fetchResponse = await fetch(url);
			if (!fetchResponse.ok) {
				throw new Error(
					`Failed to fetch file from URL: ${fetchResponse.status} ${fetchResponse.statusText}`,
				);
			}

			const blob = await fetchResponse.blob();
			const contentType =
				fetchResponse.headers.get("content-type") ?? blob.type ?? "application/octet-stream";
			const name = filename ?? filenameFromUrl(url);

			// Upload to admin as multipart
			const form = new FormData();
			form.append("sitename", sitename);
			form.append("file", new File([blob], name, { type: contentType }), name);

			const uploadResponse = await fetch(
				`${ADMIN_BASE_URL}/live/invoke/deco-sites/admin/actions/assets/upload.ts`,
				{
					method: "POST",
					headers: { "x-api-key": apiKey },
					body: form,
				},
			);

			if (!uploadResponse.ok) {
				const text = await uploadResponse.text().catch(() => uploadResponse.statusText);
				throw new Error(`Upload failed: ${uploadResponse.status} — ${text}`);
			}

			const asset = await uploadResponse.json();

			return {
				asset,
				message: `Successfully uploaded "${name}" to ${sitename}. CDN URL: ${asset.publicUrl}`,
			};
		},
	});
