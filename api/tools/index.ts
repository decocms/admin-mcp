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
	listFilesTool,
	readFileTool,
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
import {
	createSandboxTaskTool,
	killSandboxTaskTool,
	listSandboxTasksTool,
} from "./sandbox.ts";
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
	createSandboxTaskTool,
	listSandboxTasksTool,
	killSandboxTaskTool,
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
