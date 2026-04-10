import { analyticsQueryTool } from "./analytics-query.ts";
import { suggestCommitMessageTool } from "./commit-summary.ts";
import {
	listReleasesTool,
	promoteToProductionTool,
	revertCommitTool,
} from "./releases.ts";
import {
	listPullRequestsTool,
	mergePullRequestTool,
	openPullRequestTool,
} from "./pull-requests.ts";
import { assetsTool, deleteAssetTool, uploadAssetTool } from "./assets.ts";
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
	gitCheckoutBranchTool,
	gitDiffTool,
	gitDiscardTool,
	gitPublishTool,
	gitRawTool,
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
	gitCheckoutBranchTool,
	gitRawTool,
	fsUnlinkTool,
	getMonitorDataTool,
	getMonitorSummaryTool,
	getMonitorTimelineTool,
	getMonitorTopPathsTool,
	getMonitorTopCountriesTool,
	getMonitorCacheStatusTool,
	getMonitorStatusCodesTool,
	getAnalyticsDataTool,
	listPullRequestsTool,
	mergePullRequestTool,
	openPullRequestTool,
	suggestCommitMessageTool,
	listReleasesTool,
	promoteToProductionTool,
	revertCommitTool,
];
