import { createPublicResource } from "@decocms/runtime/tools";
import { RELEASES_RESOURCE_URI } from "../tools/releases.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createReleasesAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: RELEASES_RESOURCE_URI,
		name: "Releases UI",
		description:
			"Interactive commit history viewer with promote-to-production and revert capabilities",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: RELEASES_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
