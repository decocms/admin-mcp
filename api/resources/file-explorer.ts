import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { FILE_EXPLORER_RESOURCE_URI } from "../tools/files.ts";
import { PREVIEW_FRAME_DOMAINS } from "./environments.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const fileExplorerAppResource = createPublicResource({
	uri: FILE_EXPLORER_RESOURCE_URI,
	name: "File Explorer UI",
	description: "Interactive filesystem explorer for sandbox environments",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
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
