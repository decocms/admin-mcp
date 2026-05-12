import { analyticsQueryTool } from "./analytics-query.ts";
import { assetsTool, deleteAssetTool, uploadAssetTool } from "./assets.ts";
import {
	cfbDeleteBuildVarTool,
	cfbListBuildVarsTool,
	cfbSetBuildVarTool,
} from "./cfb-build-vars.ts";
import {
	cfbGetBuildLogsTool,
	cfbGetBuildTool,
	cfbListBuildsTool,
	cfbTriggerBuildTool,
} from "./cfb-builds.ts";
import {
	cfbDeleteSecretTool,
	cfbListSecretsTool,
	cfbSetSecretTool,
} from "./cfb-secrets.ts";
import { cfbSetupStatusTool, cfbSetupTool } from "./cfb-setup.ts";
import { cfbListVersionsTool, cfbRollbackTool } from "./cfb-versions.ts";
import { suggestCommitMessageTool } from "./commit-summary.ts";
import {
	createEnvironmentTool,
	deleteEnvironmentTool,
	getEnvironmentTool,
	listEnvironmentsTool,
	previewEnvironmentTool,
} from "./environments.ts";
import {
	createPageTool,
	deleteFileTool,
	duplicateFileTool,
	fileExplorerTool,
	getBlockSchemaTool,
	getPageSectionsTool,
	getPagesTool,
	grepFilesTool,
	installAppTool,
	listAppsTool,
	listFilesTool,
	listMatchersTool,
	listSectionsTool,
	readFileTool,
	replaceInFileTool,
	uninstallAppTool,
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
	getErrorPatternsTool,
	getErrorRateSeriesTool,
	getErrorsOverTimeTool,
} from "./hyperdx.ts";
import { getIssueDetailsTool, listIssuesTool } from "./issues.ts";
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
import { podLogsTool } from "./pod-logs.ts";
import {
	listPullRequestsTool,
	mergePullRequestTool,
	openPullRequestTool,
} from "./pull-requests.ts";
import {
	getProductionShaTool,
	listReleasesTool,
	promoteToProductionTool,
	revertCommitTool,
} from "./releases.ts";
import { renderHtmlTool } from "./render-html.ts";
import { testLoaderTool } from "./test-loader.ts";

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
	getPageSectionsTool,
	createPageTool,
	duplicateFileTool,
	listAppsTool,
	installAppTool,
	uninstallAppTool,
	listMatchersTool,
	listSectionsTool,
	getBlockSchemaTool,
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
	getIssueDetailsTool,
	listIssuesTool,
	listPullRequestsTool,
	mergePullRequestTool,
	openPullRequestTool,
	suggestCommitMessageTool,
	listReleasesTool,
	promoteToProductionTool,
	revertCommitTool,
	getProductionShaTool,
	getErrorPatternsTool,
	getErrorsOverTimeTool,
	getErrorRateSeriesTool,
	podLogsTool,
	renderHtmlTool,
	testLoaderTool,
	cfbSetupTool,
	cfbSetupStatusTool,
	cfbListSecretsTool,
	cfbSetSecretTool,
	cfbDeleteSecretTool,
	cfbListBuildVarsTool,
	cfbSetBuildVarTool,
	cfbDeleteBuildVarTool,
	cfbListBuildsTool,
	cfbGetBuildTool,
	cfbGetBuildLogsTool,
	cfbTriggerBuildTool,
	cfbListVersionsTool,
	cfbRollbackTool,
];
