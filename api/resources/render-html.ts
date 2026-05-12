import { createPublicResource } from "@decocms/runtime/tools";
import { RENDER_HTML_RESOURCE_URI } from "../tools/render-html.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createRenderHtmlAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: RENDER_HTML_RESOURCE_URI,
		name: "Render HTML UI",
		description: "Renders arbitrary HTML content visually",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: RENDER_HTML_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
