import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_SETUP_RESOURCE_URI } from "../tools/cfb-setup.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createCfbSetupAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: CFB_SETUP_RESOURCE_URI,
		name: "Cloudflare Workers Builds — Setup",
		description:
			"One-click onboarding and setup status for a Cloudflare Workers Builds-hosted site.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: CFB_SETUP_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
