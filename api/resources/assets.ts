import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { ASSETS_RESOURCE_URI } from "../tools/assets.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const assetsAppResource = (_env: Env) =>
	createPublicResource({
		uri: ASSETS_RESOURCE_URI,
		name: "Assets UI",
		description: "Interactive media asset gallery for deco.cx sites",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: ASSETS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
				_meta: {
					ui: {
						csp: {
							connectDomains: ["https://admin.deco.cx"],
						},
					},
				},
			};
		},
	});
