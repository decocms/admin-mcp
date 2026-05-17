import { createPublicResource } from "@decocms/runtime/tools";
import { CFB_SECRETS_RESOURCE_URI } from "../tools/cfb-secrets.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createCfbSecretsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: CFB_SECRETS_RESOURCE_URI,
		name: "Cloudflare Workers Builds — Secrets",
		description:
			"Manage runtime secrets bound to the Cloudflare Worker for the configured site.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: CFB_SECRETS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
