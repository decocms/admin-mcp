import { createPublicResource } from "@decocms/runtime/tools";
import { ISSUES_RESOURCE_URI } from "../tools/issues.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createIssuesAppResource = (getClientHTML: () => Promise<string>) =>
	createPublicResource({
		uri: ISSUES_RESOURCE_URI,
		name: "Issues UI",
		description: "Interactive issue listing for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: ISSUES_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
