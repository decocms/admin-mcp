import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_VERSIONS_RESOURCE_URI } from "../tools/cfb-versions.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createCfbVersionsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: CFB_VERSIONS_RESOURCE_URI,
		name: "Cloudflare Workers Builds — Versions",
		description:
			"List recent Cloudflare Worker versions and roll back to a previous version.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: CFB_VERSIONS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
