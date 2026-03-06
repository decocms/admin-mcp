import { assetsTool } from "./assets.ts";
import { deleteAssetTool } from "./delete-asset.ts";
import {
	createEnvironmentTool,
	getEnvironmentTool,
	listEnvironmentsTool,
	previewEnvironmentTool,
} from "./environments.ts";
import { helloTool } from "./hello.ts";
import {
	createSandboxTaskTool,
	killSandboxTaskTool,
	listSandboxTasksTool,
} from "./sandbox.ts";
import { uploadAssetTool } from "./upload-asset.ts";

export const tools = [
	helloTool,
	assetsTool,
	uploadAssetTool,
	deleteAssetTool,
	listEnvironmentsTool,
	getEnvironmentTool,
	createEnvironmentTool,
	previewEnvironmentTool,
	createSandboxTaskTool,
	listSandboxTasksTool,
	killSandboxTaskTool,
];
