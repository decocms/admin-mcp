import { createPublicResource } from "@decocms/runtime/tools";
import { MONITOR_RESOURCE_URI } from "../tools/monitor.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

// Domains needed to load the OneDollarStats (stonks) web component scripts
const ANALYTICS_RESOURCE_DOMAINS = [
	"https://admin.deco.cx",
	"https://deco.lilstts.com",
];

export const createMonitorAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: MONITOR_RESOURCE_URI,
		name: "Monitor UI",
		description: "Performance monitoring dashboard for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: MONITOR_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
				_meta: {
					ui: {
						csp: {
							resourceDomains: ANALYTICS_RESOURCE_DOMAINS,
						},
					},
				},
			};
		},
	});
