import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_BUILDS_RESOURCE_URI } from "../tools/cfb-builds.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createCfbBuildsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: CFB_BUILDS_RESOURCE_URI,
		name: "Cloudflare Workers Builds — Builds",
		description:
			"List recent Cloudflare Workers Builds, view per-build logs, and trigger new builds.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: CFB_BUILDS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
