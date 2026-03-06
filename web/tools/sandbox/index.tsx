import { Badge } from "@/components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { CheckCircle, Circle, Loader, SquareTerminal, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
	CreateSandboxTaskInput,
	CreateSandboxTaskOutput,
	KillSandboxTaskInput,
	KillSandboxTaskOutput,
	ListSandboxTasksInput,
	ListSandboxTasksOutput,
	SandboxTask,
} from "../../../api/tools/sandbox.ts";

// ─── XTerminal component ──────────────────────────────────────────────────────

interface XTerminalProps {
	wsEndpoint: string;
	wsToken: string;
	taskId: string;
}

function XTerminal({ wsEndpoint, wsToken, taskId }: XTerminalProps) {
	const divRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<"connecting" | "open" | "closed">(
		"connecting",
	);

	useEffect(() => {
		const el = divRef.current;
		if (!el) return;

		const term = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: '"Cascadia Code", "Fira Code", Menlo, monospace',
			theme: {
				background: "#0d1117",
				foreground: "#e6edf3",
				cursor: "#58a6ff",
				selectionBackground: "#264f78",
				black: "#484f58",
				red: "#ff7b72",
				green: "#3fb950",
				yellow: "#d29922",
				blue: "#58a6ff",
				magenta: "#bc8cff",
				cyan: "#39c5cf",
				white: "#b1bac4",
			},
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(el);
		fitAddon.fit();

		const wsUrl = `${wsEndpoint}/sandbox/tasks/${encodeURIComponent(taskId)}/ws?token=${encodeURIComponent(wsToken)}`;
		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			setStatus("open");
			fitAddon.fit();
			// Send initial size
			ws.send(
				JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
			);
		};

		ws.onmessage = (e) => {
			// PTY output arrives as strings (UTF-8 encoded ANSI sequences)
			term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
		};

		ws.onerror = () => {
			term.writeln("\r\n\x1b[31m[WebSocket error — check that the sandbox is running]\x1b[0m");
		};

		ws.onclose = (e) => {
			setStatus("closed");
			term.writeln(
				`\r\n\x1b[33m[Session closed${e.reason ? `: ${e.reason}` : ""}]\x1b[0m`,
			);
		};

		term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "input", data }));
			}
		});

		term.onResize(({ cols, rows }) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "resize", cols, rows }));
			}
		});

		const observer = new ResizeObserver(() => fitAddon.fit());
		observer.observe(el);

		return () => {
			observer.disconnect();
			ws.close();
			term.dispose();
		};
	}, [wsEndpoint, wsToken, taskId]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<span
					className={
						status === "open"
							? "text-green-500"
							: status === "closed"
								? "text-red-500"
								: "text-yellow-500"
					}
				>
					●
				</span>
				{status === "connecting" && "Connecting…"}
				{status === "open" && "Connected"}
				{status === "closed" && "Disconnected"}
				<span className="ml-auto font-mono opacity-60">
					{taskId.slice(0, 12)}…
				</span>
			</div>
			<div
				ref={divRef}
				className="rounded-lg overflow-hidden"
				style={{ height: "calc(100dvh - 200px)", minHeight: "300px" }}
			/>
		</div>
	);
}

// ─── TaskStatusIcon ───────────────────────────────────────────────────────────

function TaskStatusIcon({ status }: { status: string }) {
	if (status === "running")
		return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
	if (status === "completed")
		return <CheckCircle className="w-4 h-4 text-green-500" />;
	if (status === "error")
		return <XCircle className="w-4 h-4 text-red-500" />;
	return <Circle className="w-4 h-4 text-muted-foreground" />;
}

// ─── shared helpers ───────────────────────────────────────────────────────────

function InitializingView() {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
				<span className="text-sm">Connecting to host...</span>
			</div>
		</div>
	);
}

function ErrorView({ error }: { error?: string }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className="w-full max-w-md border-destructive">
				<CardHeader>
					<CardTitle className="text-destructive">Error</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-destructive">{error ?? "Unknown error"}</p>
				</CardContent>
			</Card>
		</div>
	);
}

// ─── CreateSandboxTaskPage ────────────────────────────────────────────────────

export function CreateSandboxTaskPage() {
	const state = useMcpState<CreateSandboxTaskInput, CreateSandboxTaskOutput>();

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md">
					<CardContent className="pt-6 text-center text-sm text-muted-foreground">
						Task creation cancelled.
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "connected" || state.status === "tool-input") {
		const { env, prompt, issue } = state.toolInput ?? {};
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
							Starting AI agent…
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{env && (
							<p className="text-sm text-muted-foreground">
								Environment: <Badge variant="secondary">{env}</Badge>
							</p>
						)}
						{prompt && (
							<p className="text-sm text-muted-foreground line-clamp-3">
								{prompt}
							</p>
						)}
						{issue && (
							<p className="text-xs text-muted-foreground truncate">{issue}</p>
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	// tool-result — show live terminal
	const { taskId, status, env, prompt, wsEndpoint, wsToken } =
		state.toolResult ?? {
			taskId: "",
			status: "",
			env: "",
			wsEndpoint: "",
			wsToken: "",
		};

	return (
		<div className="flex flex-col gap-3 p-4 min-h-dvh">
			<div className="flex items-center gap-2">
				<SquareTerminal className="w-5 h-5 text-muted-foreground" />
				<span className="font-semibold text-sm">AI Agent Terminal</span>
				<Badge variant="secondary" className="ml-auto">
					{env}
				</Badge>
				<TaskStatusIcon status={status} />
			</div>

			{prompt && (
				<p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded px-2 py-1.5">
					{prompt}
				</p>
			)}

			{wsEndpoint && taskId ? (
				<XTerminal
					wsEndpoint={wsEndpoint}
					wsToken={wsToken}
					taskId={taskId}
				/>
			) : (
				<Card className="border-destructive">
					<CardContent className="pt-4">
						<p className="text-sm text-destructive">
							No terminal connection available for this task.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ─── ListSandboxTasksPage ─────────────────────────────────────────────────────

export function ListSandboxTasksPage() {
	const state = useMcpState<ListSandboxTasksInput, ListSandboxTasksOutput>();
	const [selectedTask, setSelectedTask] = useState<SandboxTask | null>(null);

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;
	if (state.status === "tool-cancelled") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-md">
					<CardContent className="pt-6 text-center text-sm text-muted-foreground">
						Cancelled.
					</CardContent>
				</Card>
			</div>
		);
	}

	if (state.status === "connected" || state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">
						{state.toolInput?.env
							? `Fetching tasks for "${state.toolInput.env}"…`
							: "Waiting for tool call…"}
					</span>
				</div>
			</div>
		);
	}

	const { tasks, env, site, wsEndpoint, wsToken } = state.toolResult ?? {
		tasks: [],
		env: "",
		site: "",
		wsEndpoint: "",
		wsToken: "",
	};

	return (
		<div className="flex flex-col gap-3 p-4 min-h-dvh">
			<div className="flex items-center gap-2">
				<SquareTerminal className="w-5 h-5 text-muted-foreground" />
				<div>
					<h1 className="text-sm font-semibold">Sandbox Tasks</h1>
					<p className="text-xs text-muted-foreground">
						{site} / {env} &middot; {tasks.length} task
						{tasks.length !== 1 ? "s" : ""}
					</p>
				</div>
			</div>

			{selectedTask ? (
				<div className="flex flex-col gap-2">
					<button
						type="button"
						onClick={() => setSelectedTask(null)}
						className="text-xs text-muted-foreground hover:text-foreground self-start"
					>
						← Back to tasks
					</button>
					<div className="flex items-center gap-2">
						<TaskStatusIcon status={selectedTask.status} />
						<span className="text-sm font-medium">
							{selectedTask.prompt ?? selectedTask.issue ?? selectedTask.taskId}
						</span>
						<Badge variant="secondary" className="ml-auto text-xs">
							{selectedTask.status}
						</Badge>
					</div>
					{wsEndpoint && selectedTask.taskId ? (
						<XTerminal
							wsEndpoint={wsEndpoint}
							wsToken={wsToken}
							taskId={selectedTask.taskId}
						/>
					) : (
						<p className="text-sm text-muted-foreground">
							No terminal connection available.
						</p>
					)}
				</div>
			) : (
				<div className="space-y-2">
					{tasks.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
							<SquareTerminal className="w-10 h-10 opacity-40" />
							<p className="text-sm">No tasks in this environment</p>
						</div>
					) : (
						tasks.map((task) => (
							<button
								key={task.taskId}
								type="button"
								onClick={() => setSelectedTask(task)}
								className="w-full text-left rounded-lg border p-3 hover:border-primary/50 hover:bg-muted/30 transition-colors space-y-1.5"
							>
								<div className="flex items-center gap-2">
									<TaskStatusIcon status={task.status} />
									<span className="text-sm font-medium truncate flex-1">
										{task.prompt ?? task.issue ?? task.taskId}
									</span>
									<Badge variant="outline" className="text-xs shrink-0">
										{task.status}
									</Badge>
								</div>
								{task.createdAt && (
									<p className="text-xs text-muted-foreground pl-6">
										{new Date(task.createdAt).toLocaleString()}
									</p>
								)}
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}

// ─── KillSandboxTaskPage ──────────────────────────────────────────────────────

export function KillSandboxTaskPage() {
	const state = useMcpState<KillSandboxTaskInput, KillSandboxTaskOutput>();

	if (state.status === "initializing") return <InitializingView />;
	if (state.status === "error") return <ErrorView error={state.error} />;

	if (state.status === "connected" || state.status === "tool-input") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">Killing task…</span>
				</div>
			</div>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<Card className="w-full max-w-sm">
					<CardContent className="pt-6 text-center text-sm text-muted-foreground">
						Cancelled.
					</CardContent>
				</Card>
			</div>
		);
	}

	const { ok, taskId, message } = state.toolResult ?? {
		ok: false,
		taskId: "",
		message: "",
	};

	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			<Card className={cn("w-full max-w-sm", !ok && "border-destructive")}>
				<CardHeader>
					<CardTitle
						className={cn(
							"flex items-center gap-2",
							ok ? "text-green-600" : "text-destructive",
						)}
					>
						{ok ? (
							<CheckCircle className="w-5 h-5" />
						) : (
							<XCircle className="w-5 h-5" />
						)}
						{ok ? "Task terminated" : "Failed to kill task"}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">{message}</p>
					{taskId && (
						<code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-2 block">
							{taskId}
						</code>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function cn(...classes: (string | boolean | undefined)[]) {
	return classes.filter(Boolean).join(" ");
}
