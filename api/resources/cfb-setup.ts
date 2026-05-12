import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_SETUP_RESOURCE_URI } from "../tools/cfb-setup.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const cfbSetupAppResource = createPublicResource({
	uri: CFB_SETUP_RESOURCE_URI,
	name: "Cloudflare Workers Builds — Setup",
	description:
		"One-click onboarding and setup status for a Cloudflare Workers Builds-hosted site.",
	mimeType: RESOURCE_MIME_TYPE,
	read: async () => {
		const html = await readFile(getDistPath(), "utf-8");
		return {
			uri: CFB_SETUP_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: html,
		};
	},
});
