import { createPublicResource } from "@decocms/runtime/tools";
import { ENVIRONMENTS_RESOURCE_URI } from "../tools/environments.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

// Domains that deco.cx environments can be served from — used for preview iframes
export const PREVIEW_FRAME_DOMAINS = [
	"https://*.decocdn.com",
	"https://*.decocache.com",
	"https://*.deco.site",
	"https://*.deco.host",
	"https://*.deco.cx",
];

export const createEnvironmentsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: ENVIRONMENTS_RESOURCE_URI,
		name: "Environments UI",
		description: "Interactive environment management for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: ENVIRONMENTS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
				_meta: {
					ui: {
						csp: {
							frameDomains: PREVIEW_FRAME_DOMAINS,
						},
					},
				},
			};
		},
	});
