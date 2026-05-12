import { createPublicResource } from "@decocms/runtime/tools";
import { ASSETS_RESOURCE_URI } from "../tools/assets.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createAssetsAppResource = (getClientHTML: () => Promise<string>) =>
	createPublicResource({
		uri: ASSETS_RESOURCE_URI,
		name: "Assets UI",
		description: "Interactive media asset gallery for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: ASSETS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
				_meta: {
					ui: {
						csp: {
							connectDomains: ["https://admin.deco.cx"],
						},
					},
				},
			};
		},
	});
