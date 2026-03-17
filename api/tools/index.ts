import { analyticsQueryTool } from "./analytics-query.ts";
import { assetsTool } from "./assets.ts";
import { deleteAssetTool } from "./delete-asset.ts";
import {
	createEnvironmentTool,
	deleteEnvironmentTool,
	getEnvironmentTool,
	listEnvironmentsTool,
	previewEnvironmentTool,
} from "./environments.ts";
import {
	deleteFileTool,
	fileExplorerTool,
	getPagesTool,
	grepFilesTool,
	listFilesTool,
	readFileTool,
	replaceInFileTool,
	updateJsonTool,
	writeFileTool,
} from "./files.ts";
import {
	fsUnlinkTool,
	gitDiffTool,
	gitDiscardTool,
	gitPublishTool,
	gitStatusTool,
} from "./git.ts";
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
import { uploadAssetTool } from "./upload-asset.ts";

export const tools = [
	analyticsQueryTool,
	assetsTool,
	uploadAssetTool,
	deleteAssetTool,
	listEnvironmentsTool,
	getEnvironmentTool,
	createEnvironmentTool,
	deleteEnvironmentTool,
	previewEnvironmentTool,
	fileExplorerTool,
	listFilesTool,
	readFileTool,
	writeFileTool,
	deleteFileTool,
	grepFilesTool,
	replaceInFileTool,
	updateJsonTool,
	getPagesTool,
	gitStatusTool,
	gitDiffTool,
	gitPublishTool,
	gitDiscardTool,
	fsUnlinkTool,
	getMonitorDataTool,
	getMonitorSummaryTool,
	getMonitorTimelineTool,
	getMonitorTopPathsTool,
	getMonitorTopCountriesTool,
	getMonitorCacheStatusTool,
	getMonitorStatusCodesTool,
	getAnalyticsDataTool,
];
