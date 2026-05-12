import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_BUILD_VARS_RESOURCE_URI } from "../tools/cfb-build-vars.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createCfbBuildVarsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: CFB_BUILD_VARS_RESOURCE_URI,
		name: "Cloudflare Workers Builds — Build Vars",
		description:
			"Manage build-time variables on the Cloudflare production trigger for the configured site.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: CFB_BUILD_VARS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
