import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { RENDER_HTML_RESOURCE_URI } from "../tools/render-html.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const renderHtmlAppResource = createPublicResource({
	uri: RENDER_HTML_RESOURCE_URI,
	name: "Render HTML UI",
	description: "Renders arbitrary HTML content visually",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: RENDER_HTML_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
