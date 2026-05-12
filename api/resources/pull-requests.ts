import { createPublicResource } from "@decocms/runtime/tools";
import { PULL_REQUESTS_RESOURCE_URI } from "../tools/pull-requests.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createPullRequestsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: PULL_REQUESTS_RESOURCE_URI,
		name: "Pull Requests UI",
		description: "Interactive pull request management for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: PULL_REQUESTS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
