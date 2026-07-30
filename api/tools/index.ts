import { analyticsQueryTool } from "./analytics-query.ts";
import { assetsTool, deleteAssetTool, uploadAssetTool } from "./assets.ts";
import {
	createExperimentTool,
	experimentResultsTool,
	listExperimentsTool,
} from "./experiments.ts";
import {
	getAnalyticsDataTool,
	getMonitorCacheStatusTool,
	getMonitorDataTool,
	getMonitorStatusCodesTool,
	getMonitorSummaryTool,
	getMonitorTimelineTool,
	getMonitorTopCountriesTool,
	getMonitorTopPathsTool,
} from "./monitor.ts";
export const tools = [
	analyticsQueryTool,
	assetsTool,
	uploadAssetTool,
	deleteAssetTool,
	getMonitorDataTool,
	getMonitorSummaryTool,
	getMonitorTimelineTool,
	getMonitorTopPathsTool,
	getMonitorTopCountriesTool,
	getMonitorCacheStatusTool,
	getMonitorStatusCodesTool,
	getAnalyticsDataTool,
	listExperimentsTool,
	experimentResultsTool,
	createExperimentTool,
];
