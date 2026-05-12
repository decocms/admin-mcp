import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_VERSIONS_RESOURCE_URI } from "../tools/cfb-versions.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const cfbVersionsAppResource = createPublicResource({
	uri: CFB_VERSIONS_RESOURCE_URI,
	name: "Cloudflare Workers Builds — Versions",
	description:
		"List recent Cloudflare Worker versions and roll back to a previous version.",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: CFB_VERSIONS_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
