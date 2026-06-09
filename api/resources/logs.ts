import { createPublicResource } from "@decocms/runtime/tools";
import { LOGS_RESOURCE_URI } from "../tools/logs.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

const LOGS_FRAME_DOMAINS = [
	"https://hyperdx.io",
	"https://www.hyperdx.io",
];

export const createLogsAppResource = (getClientHTML: () => Promise<string>) =>
	createPublicResource({
		uri: LOGS_RESOURCE_URI,
		name: "Logs UI",
		description: "Observability logs viewer for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: LOGS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
				_meta: {
					ui: {
						csp: {
							frameDomains: LOGS_FRAME_DOMAINS,
						},
					},
				},
			};
		},
	});
