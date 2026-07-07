import { createPublicResource } from "@decocms/runtime/tools";
import { EXPERIMENTS_RESOURCE_URI } from "../tools/experiments.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export const createExperimentsAppResource = (
	getClientHTML: () => Promise<string>,
) =>
	createPublicResource({
		uri: EXPERIMENTS_RESOURCE_URI,
		name: "A/B Test Results UI",
		description:
			"Interactive A/B test results dashboard: variant conversions, timeseries, and significance statistics for deco.cx experiments",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await getClientHTML();
			return {
				uri: EXPERIMENTS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
