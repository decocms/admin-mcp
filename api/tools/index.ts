import { analyticsQueryTool } from "./analytics-query.ts";
import { assetsTool, deleteAssetTool, uploadAssetTool } from "./assets.ts";
import {
	createExperimentTool,
	experimentResultsTool,
	listExperimentsTool,
} from "./experiments.ts";
import {
	getErrorPatternsTool,
	getErrorRateSeriesTool,
	getErrorsOverTimeTool,
} from "./hyperdx.ts";
import { getLogsDataTool } from "./logs.ts";
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
import {
	getProductionShaTool,
	listReleasesTool,
	promoteToProductionTool,
	revertCommitTool,
} from "./releases.ts";

export const tools = [
	analyticsQueryTool,
	assetsTool,
	uploadAssetTool,
	deleteAssetTool,
	getLogsDataTool,
	getMonitorDataTool,
	getMonitorSummaryTool,
	getMonitorTimelineTool,
	getMonitorTopPathsTool,
	getMonitorTopCountriesTool,
	getMonitorCacheStatusTool,
	getMonitorStatusCodesTool,
	getAnalyticsDataTool,
	listReleasesTool,
	promoteToProductionTool,
	revertCommitTool,
	getProductionShaTool,
	getErrorPatternsTool,
	getErrorsOverTimeTool,
	getErrorRateSeriesTool,
	listExperimentsTool,
	experimentResultsTool,
	createExperimentTool,
];
