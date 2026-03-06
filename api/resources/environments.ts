import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { ENVIRONMENTS_RESOURCE_URI } from "../tools/environments.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

// Domains that deco.cx environments can be served from — used for preview iframes
export const PREVIEW_FRAME_DOMAINS = [
	"https://*.decocdn.com",
	"https://*.decocache.com",
	"https://*.deco.site",
	"https://*.deco.host",
	"https://*.deco.cx",
	"https://sites-farmrio--vdqi85.decocdn.com/"
];

export const environmentsAppResource = (_env: Env) =>
	createPublicResource({
		uri: ENVIRONMENTS_RESOURCE_URI,
		name: "Environments UI",
		description: "Interactive environment management for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: ENVIRONMENTS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
				// Unlock frame-src so the preview tool can embed deco environments
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
