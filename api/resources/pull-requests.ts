import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { PULL_REQUESTS_RESOURCE_URI } from "../tools/pull-requests.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const pullRequestsAppResource = createPublicResource({
	uri: PULL_REQUESTS_RESOURCE_URI,
	name: "Pull Requests UI",
	description: "Interactive pull request management for deco.cx sites",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: PULL_REQUESTS_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
