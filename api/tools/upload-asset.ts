import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { assetSchema } from "./assets.ts";
import type { Env } from "../types/env.ts";

const ADMIN_BASE_URL =
	process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

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
		return name && name.includes(".") ? name : "asset";
	} catch {
		return "asset";
	}
}

export const uploadAssetTool = (env: Env) =>
	createTool({
		id: "upload_asset",
		description:
			"Upload a media asset for the configured deco.cx site. Accepts either a public URL (the server downloads it) or base64-encoded file content. Returns the uploaded asset with its CDN URL.",
		inputSchema: uploadAssetInputSchema,
		outputSchema: uploadAssetOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
	execute: async ({ context }) => {
		const { url, data, mimeType, filename } = context;

		const state = env.MESH_REQUEST_CONTEXT?.state;
		const apiKey = env.MESH_REQUEST_CONTEXT?.authorization;
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
			const fetchResponse = await fetch(url!);
			if (!fetchResponse.ok) {
				throw new Error(
					`Failed to fetch file from URL: ${fetchResponse.status} ${fetchResponse.statusText}`,
				);
			}
			fileBlob = await fetchResponse.blob();
			contentType =
				fetchResponse.headers.get("content-type") ?? fileBlob.type ?? "application/octet-stream";
			name = filename ?? filenameFromUrl(url!);
		}

		// Upload to admin as multipart
		const form = new FormData();
		form.append("sitename", sitename);
		form.append("file", new File([fileBlob], name, { type: contentType }), name);

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
