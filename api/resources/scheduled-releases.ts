import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { SCHEDULED_RELEASES_RESOURCE_URI } from "../tools/scheduled-releases.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const scheduledReleasesAppResource = createPublicResource({
	uri: SCHEDULED_RELEASES_RESOURCE_URI,
	name: "Scheduled Releases UI",
	description:
		"Calendar-first view of upcoming and past scheduled releases (campaigns and permanent ships).",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: SCHEDULED_RELEASES_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
