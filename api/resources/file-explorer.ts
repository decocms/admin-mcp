import { createPublicResource } from "@decocms/runtime/tools";
import { FILE_EXPLORER_RESOURCE_URI } from "../tools/files.ts";
import { PREVIEW_FRAME_DOMAINS } from "./environments.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createFileExplorerAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: FILE_EXPLORER_RESOURCE_URI,
		name: "File Explorer UI",
		description: "Interactive filesystem explorer for sandbox environments",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: FILE_EXPLORER_RESOURCE_URI,
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
