import { ExternalLink, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import type { GetLogsDataOutput } from "../../../api/tools/logs.ts";

const IFRAME_QUERYSTRING_FIELD_NAME = "qs";
const HYPERDX_ORIGIN = "https://hyperdx.io";

function buildHyperDxSrc(
	apiKey: string,
	iframeSearchParams: URLSearchParams,
): string {
	const query = new URLSearchParams(iframeSearchParams);
	const rawPathname = query.get("pathname");
	const pathname = rawPathname?.startsWith("/") ? rawPathname : "/search";
	query.delete("pathname");
	query.delete("embed");
	query.delete("auth");
	const qs = query.toString();
	return `${HYPERDX_ORIGIN}${pathname}?embed=true&auth=${apiKey}${
		qs ? `&${qs}` : ""
	}`;
}

function parseHyperDxQueryFromEvent(event: MessageEvent): string {
	const data = (
		event.data as {
			data?: { pathname?: string; query?: Record<string, string> };
		}
	)?.data;
	if (!data?.pathname || typeof data.pathname !== "string") return "";

	const query = new URLSearchParams(data.query ?? {});
	query.set("pathname", data.pathname);
	query.delete("embed");
	query.delete("auth");
	return query.toString();
}

function HyperDXIframe({ apiKey }: { apiKey: string }) {
	const [iframeQuery, setIframeQuery] = useState(() => {
		const searchParams = new URLSearchParams(globalThis.location.search);
		return searchParams.get(IFRAME_QUERYSTRING_FIELD_NAME) ?? "";
	});

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== HYPERDX_ORIGIN) return;

			const query = parseHyperDxQueryFromEvent(event);
			if (!query) return;

			setIframeQuery(query);

			const url = new URL(globalThis.location.href);
			url.searchParams.set(IFRAME_QUERYSTRING_FIELD_NAME, query);
			const path = url.pathname + url.search;
			globalThis.history.pushState({ path }, "", path);
		};

		globalThis.addEventListener("message", handleMessage);
		return () => globalThis.removeEventListener("message", handleMessage);
	}, []);

	const src = useMemo(() => {
		const iframeSearchParams = new URLSearchParams(iframeQuery);
		return buildHyperDxSrc(apiKey, iframeSearchParams);
	}, [apiKey, iframeQuery]);

	return (
		<iframe
			title="HyperDX Logs"
			src={src}
			className="w-full h-dvh border-0 bg-background"
		/>
	);
}

export default function LogsPage() {
	const app = useMcpApp();
	const mcpState = useMcpState<unknown, GetLogsDataOutput>();

	const initialResult =
		mcpState.status === "tool-result" ? mcpState.toolResult : null;

	const [result, setResult] = useState<GetLogsDataOutput | null>(
		initialResult ?? null,
	);

	useEffect(() => {
		if (initialResult) {
			setResult(initialResult);
		}
	}, [initialResult]);

	useEffect(() => {
		if (result || !app || mcpState.status !== "connected") return;

		let cancelled = false;

		app
			.callServerTool({ name: "get_logs_data", arguments: {} })
			.then((toolResult) => {
				if (
					cancelled ||
					toolResult?.isError ||
					!toolResult?.structuredContent
				) {
					return;
				}
				setResult(toolResult.structuredContent as GetLogsDataOutput);
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [app, mcpState.status, result]);

	const sitename = result?.sitename ?? "";
	const apiKey = result?.apiKey ?? null;

	useEffect(() => {
		if (!app || !sitename) return;
		app
			.updateModelContext({
				content: [{ type: "text", text: `Site: **${sitename}**` }],
			})
			.catch(() => {});
		return () => {
			app.updateModelContext({ content: [] }).catch(() => {});
		};
	}, [app, sitename]);

	const openDiscord = useCallback(() => {
		globalThis.open("https://deco.cx/discord", "_blank", "noopener,noreferrer");
	}, []);

	if (!result) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Loading logs...</span>
				</div>
			</div>
		);
	}

	if (!apiKey) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Empty className="max-w-md border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Search />
						</EmptyMedia>
						<EmptyTitle>Logs not available</EmptyTitle>
						<EmptyDescription>
							Contact our team to activate observability for this site.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={openDiscord}>
							Contact us
							<ExternalLink className="ml-2 size-4" />
						</Button>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	return <HyperDXIframe apiKey={apiKey} />;
}
