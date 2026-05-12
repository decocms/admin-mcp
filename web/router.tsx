import { createHashHistory } from "@tanstack/history";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { useMcpHostContext, useMcpState } from "./context.tsx";
import AssetsPage from "./tools/assets/index.tsx";
import CfbBuildVarsPage from "./tools/cfb-build-vars/index.tsx";
import CfbBuildsPage from "./tools/cfb-builds/index.tsx";
import CfbSecretsPage from "./tools/cfb-secrets/index.tsx";
import CfbSetupPage from "./tools/cfb-setup/index.tsx";
import CfbVersionsPage from "./tools/cfb-versions/index.tsx";
import FileExplorerPage from "./tools/file-explorer/index.tsx";
import IssuesPage from "./tools/issues/index.tsx";
import MonitorPage from "./tools/monitor/index.tsx";
import PullRequestsPage from "./tools/pull-requests/index.tsx";
import ReleasesPage from "./tools/releases/index.tsx";
import RenderHtmlPage from "./tools/render-html/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
	fetch_assets: AssetsPage,
	file_explorer: FileExplorerPage,
	get_monitor_data: MonitorPage,
	list_issues: IssuesPage,
	list_pull_requests: PullRequestsPage,
	list_releases: ReleasesPage,
	render_html: RenderHtmlPage,
	cfb_setup: CfbSetupPage,
	cfb_setup_status: CfbSetupPage,
	cfb_list_secrets: CfbSecretsPage,
	cfb_set_secret: CfbSecretsPage,
	cfb_delete_secret: CfbSecretsPage,
	cfb_list_build_vars: CfbBuildVarsPage,
	cfb_set_build_var: CfbBuildVarsPage,
	cfb_delete_build_var: CfbBuildVarsPage,
	cfb_list_builds: CfbBuildsPage,
	cfb_get_build: CfbBuildsPage,
	cfb_get_build_logs: CfbBuildsPage,
	cfb_trigger_build: CfbBuildsPage,
	cfb_list_versions: CfbVersionsPage,
	cfb_rollback: CfbVersionsPage,
};

function ToolRouter() {
	const { toolName } = useMcpState();

	if (!toolName) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Connecting to host...</span>
				</div>
			</div>
		);
	}

	const Page = TOOL_PAGES[toolName];

	if (!Page) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<p className="text-sm text-destructive">Unknown tool: {toolName}</p>
			</div>
		);
	}

	return <Page />;
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: ToolRouter,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({
	routeTree,
	history: createHashHistory(),
});

export function AppRouter() {
	return <RouterProvider router={router} />;
}

function RootLayout() {
	const hostContext = useMcpHostContext();
	const insets = hostContext?.safeAreaInsets;

	return (
		<div
			style={
				insets
					? {
							paddingTop: `${insets.top}px`,
							paddingRight: `${insets.right}px`,
							paddingBottom: `${insets.bottom}px`,
							paddingLeft: `${insets.left}px`,
						}
					: undefined
			}
		>
			<Outlet />
		</div>
	);
}
