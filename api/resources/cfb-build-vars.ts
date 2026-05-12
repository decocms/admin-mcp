import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_BUILD_VARS_RESOURCE_URI } from "../tools/cfb-build-vars.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const cfbBuildVarsAppResource = createPublicResource({
	uri: CFB_BUILD_VARS_RESOURCE_URI,
	name: "Cloudflare Workers Builds — Build Vars",
	description:
		"Manage build-time variables on the Cloudflare production trigger for the configured site.",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: CFB_BUILD_VARS_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
