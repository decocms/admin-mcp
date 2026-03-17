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
import {
	DeleteEnvironmentPage,
	ListEnvironmentsPage,
} from "./tools/environments/index.tsx";
import FileExplorerPage from "./tools/file-explorer/index.tsx";
import MonitorPage from "./tools/monitor/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
	fetch_assets: AssetsPage,
	list_environments: ListEnvironmentsPage,
	delete_environment: DeleteEnvironmentPage,
	file_explorer: FileExplorerPage,
	get_monitor_data: MonitorPage,
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
