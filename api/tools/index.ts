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
	fsUnlinkTool,
	gitDiscardTool,
	gitDiffTool,
	gitPublishTool,
	gitStatusTool,
} from "./git.ts";
import {
	createSandboxTaskTool,
	killSandboxTaskTool,
	listSandboxTasksTool,
} from "./sandbox.ts";
import { uploadAssetTool } from "./upload-asset.ts";

export const tools = [
	assetsTool,
	uploadAssetTool,
	deleteAssetTool,
	listEnvironmentsTool,
	getEnvironmentTool,
	createEnvironmentTool,
	deleteEnvironmentTool,
	previewEnvironmentTool,
	createSandboxTaskTool,
	listSandboxTasksTool,
	killSandboxTaskTool,
	gitStatusTool,
	gitDiffTool,
	gitPublishTool,
	gitDiscardTool,
	fsUnlinkTool,
];
