import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

const ADMIN_BASE_URL = process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

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

export const deleteAssetTool = (env: Env) =>
	createTool({
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
		execute: async ({ context }) => {
			const { id } = context;

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
