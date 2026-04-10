import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { RELEASES_RESOURCE_URI } from "../tools/releases.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const releasesAppResource = createPublicResource({
	uri: RELEASES_RESOURCE_URI,
	name: "Releases UI",
	description:
		"Interactive commit history viewer with promote-to-production and revert capabilities",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: RELEASES_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
