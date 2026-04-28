import { useMcpState } from "@/context.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import type {
	RenderHtmlInput,
	RenderHtmlOutput,
} from "../../../api/tools/render-html.ts";

export default function RenderHtmlPage() {
	const state = useMcpState<RenderHtmlInput, RenderHtmlOutput>();

	if (state.status === "initializing") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-foreground/50 rounded-full animate-spin" />
					<span className="text-sm">Connecting to host...</span>
				</div>
			</div>
		);
	}

	if (state.status === "connected") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm text-center">
					<CardHeader>
						<CardTitle className="text-base">HTML Renderer</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Call the{" "}
							<Badge variant="secondary" className="font-mono text-xs">
								render_html
							</Badge>{" "}
							tool to render HTML content.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm border-destructive/40">
					<CardHeader>
						<CardTitle className="text-destructive text-base">Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							{state.error ?? "Unknown error"}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm">
					<CardContent className="pt-6">
						<p className="text-sm text-muted-foreground text-center">
							Tool call was cancelled.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	// tool-input: show the HTML from input while waiting for result
	// tool-result: show the HTML from output
	const html =
		state.status === "tool-input"
			? state.toolInput?.html ?? ""
			: state.toolResult?.html ?? "";

	if (!html) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<p className="text-sm text-muted-foreground">No HTML content.</p>
			</div>
		);
	}

	return (
		<iframe
			srcDoc={html}
			title="HTML Preview"
			sandbox="allow-scripts allow-same-origin"
			className="w-full min-h-dvh border-0"
		/>
	);
}
