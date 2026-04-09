import { DiffEditor } from "@monaco-editor/react";
import {
	ArrowRight,
	ChevronRight,
	Eye,
	FileCode2,
	GitPullRequest,
	Loader2,
	MoreHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useMcpApp } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type { GitDiffResult, GitStatus } from "../../../api/tools/git.ts";
import { getLanguageFromPath } from "./utils.ts";

// ─── types ────────────────────────────────────────────────────────────────────

interface PublishDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userEnv: string;
	envUrl: string | null;
	showPreviewAction: boolean;
	editorTheme: "vs" | "vs-dark";
	gitStatus: GitStatus | null;
	onGitStatusChange: (status: GitStatus | null) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export function PublishDialog({
	open,
	onOpenChange,
	userEnv,
	envUrl,
	showPreviewAction,
	editorTheme,
	gitStatus,
	onGitStatusChange,
}: PublishDialogProps) {
	const app = useMcpApp();

	const [gitDiff, setGitDiff] = useState<GitDiffResult | null>(null);
	const [isLoadingGitDiff, setIsLoadingGitDiff] = useState(false);
	const [expandedDiffFile, setExpandedDiffFile] = useState<string | null>(null);
	const [isPublishing, setIsPublishing] = useState(false);
	const [publishMessage, setPublishMessage] = useState("");
	const [publishError, setPublishError] = useState<string>();
	const [discardConfirmFile, setDiscardConfirmFile] = useState<string | null>(
		null,
	);

	const changesCount = gitStatus
		? gitStatus.modified.length +
			gitStatus.created.length +
			gitStatus.deleted.length +
			gitStatus.not_added.length +
			gitStatus.renamed.length
		: 0;

	// ─── load on open ───────────────────────────────────────────────────────────

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run only when dialog opens
	useEffect(() => {
		if (!open || !app || !userEnv) return;

		let cancelled = false;

		setIsLoadingGitDiff(true);
		setPublishError(undefined);
		setExpandedDiffFile(null);
		setGitDiff(null);

		Promise.all([
			app.callServerTool({ name: "git_status", arguments: { env: userEnv } }),
			app.callServerTool({ name: "git_diff", arguments: { env: userEnv } }),
		])
			.then(([statusResult, diffResult]) => {
				if (cancelled) return;
				if (statusResult && !statusResult.isError) {
					const data = statusResult.structuredContent as GitStatus | undefined;
					if (data) onGitStatusChange(data);
				}
				if (diffResult && !diffResult.isError) {
					const data = diffResult.structuredContent as
						| GitDiffResult
						| undefined;
					if (data) setGitDiff(data);
				}
			})
			.catch(() => {
				if (!cancelled) setPublishError("Failed to load changes.");
			})
			.finally(() => {
				if (!cancelled) setIsLoadingGitDiff(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (isPublishing) return;
		onOpenChange(nextOpen);
		if (!nextOpen) setExpandedDiffFile(null);
	};

	// ─── publish ────────────────────────────────────────────────────────────────

	const handlePublish = async () => {
		if (!app || !userEnv) return;
		setIsPublishing(true);
		setPublishError(undefined);

		try {
			const result = await app.callServerTool({
				name: "git_publish",
				arguments: {
					env: userEnv,
					...(publishMessage ? { message: publishMessage } : {}),
				},
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to publish",
				);
			}

			toast.success("Changes published successfully!");
			onOpenChange(false);
			setGitDiff(null);
			setPublishMessage("");

			const statusResult = await app.callServerTool({
				name: "git_status",
				arguments: { env: userEnv },
			});
			if (!statusResult?.isError) {
				const data = statusResult?.structuredContent as GitStatus | undefined;
				onGitStatusChange(data ?? null);
			}
		} catch (error) {
			setPublishError(
				error instanceof Error ? error.message : "Failed to publish",
			);
		} finally {
			setIsPublishing(false);
		}
	};

	// ─── discard ────────────────────────────────────────────────────────────────

	const handleDiscardFile = async (filepath: string) => {
		if (!app || !userEnv) return;
		setDiscardConfirmFile(null);

		try {
			const result = await app.callServerTool({
				name: "git_discard",
				arguments: { env: userEnv, filepaths: [filepath] },
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to discard changes",
				);
			}

			toast.success(`Discarded changes to ${filepath}`);

			setGitDiff((prev) => {
				if (!prev) return prev;
				const next = { ...prev, diffs: { ...prev.diffs } };
				delete next.diffs[filepath];
				return next;
			});
			if (expandedDiffFile === filepath) setExpandedDiffFile(null);

			const statusResult = await app.callServerTool({
				name: "git_status",
				arguments: { env: userEnv },
			});
			if (!statusResult?.isError) {
				const data = statusResult?.structuredContent as GitStatus | undefined;
				onGitStatusChange(data ?? null);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to discard changes",
			);
		}
	};

	// ─── render ─────────────────────────────────────────────────────────────────

	const diffCount = gitDiff ? Object.keys(gitDiff.diffs).length : changesCount;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="top-14 left-auto right-4 translate-x-0 flex max-h-[85vh] w-[90vw] max-w-[600px] h-[90%] translate-y-0 flex-col gap-0 overflow-hidden p-0">
				<Tabs defaultValue="description" className="flex h-full flex-col gap-0">
					{/* Header */}
					<div className="shrink-0 space-y-3 px-6 pt-5 pb-4">
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								Publish
							</p>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
								{diffCount} {diffCount === 1 ? "change" : "changes"} to publish
							</div>
						</div>
						<TabsList className="h-8 w-auto">
							<TabsTrigger value="description" className="px-3 text-xs">
								Description
							</TabsTrigger>
							<TabsTrigger value="changes" className="px-3 text-xs">
								Changes
							</TabsTrigger>
						</TabsList>
					</div>

					<div className="border-t" />

					{/* Scrollable content */}
					<div className="min-h-0 flex-1 overflow-y-auto">
						{isLoadingGitDiff ? (
							<div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="text-sm">Loading changes…</span>
							</div>
						) : (
							<>
								<TabsContent value="description" className="mt-0 px-6 py-5">
									<div className="space-y-2">
										<label
											htmlFor="publish-description"
											className="text-sm font-medium"
										>
											Description
										</label>
										<Textarea
											id="publish-description"
											value={publishMessage}
											onChange={(e) => setPublishMessage(e.target.value)}
											placeholder="Describe the changes being published…"
											disabled={isPublishing}
											rows={8}
											className="resize-none"
										/>
									</div>
								</TabsContent>

								<TabsContent value="changes" className="mt-0">
									{gitDiff && Object.keys(gitDiff.diffs).length === 0 && (
										<div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
											No changes
										</div>
									)}
									{gitDiff && Object.keys(gitDiff.diffs).length > 0 && (
										<div className="divide-y">
											{Object.entries(gitDiff.diffs).map(
												([filepath, { from, to }]) => {
													const isExpanded = expandedDiffFile === filepath;
													const isNew = from === null;
													const isDeleted = to === null;
													const raw = filepath.startsWith("/")
														? filepath.slice(1)
														: filepath;
													const lastSlash = raw.lastIndexOf("/");
													const basename =
														lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;
													const directory =
														lastSlash >= 0 ? raw.slice(0, lastSlash) : null;
													const language = getLanguageFromPath(filepath);
													const dotColor = isNew
														? "bg-green-500"
														: isDeleted
															? "bg-red-500"
															: "bg-amber-500";

													return (
														<div key={filepath}>
															{/* File row */}
															<div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30">
																<button
																	type="button"
																	className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-transform hover:text-foreground"
																	onClick={() =>
																		setExpandedDiffFile(
																			isExpanded ? null : filepath,
																		)
																	}
																>
																	<ChevronRight
																		className={cn(
																			"h-3.5 w-3.5 transition-transform",
																			isExpanded && "rotate-90",
																		)}
																	/>
																</button>
																<div
																	className={cn(
																		"h-2.5 w-2.5 shrink-0 rounded-full",
																		dotColor,
																	)}
																/>
																<FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
																<span className="min-w-0 flex-1 truncate text-sm font-medium">
																	{basename}
																</span>
																{directory && (
																	<span className="shrink-0 text-xs text-muted-foreground">
																		{directory}
																	</span>
																)}
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<button
																			type="button"
																			className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
																		>
																			<MoreHorizontal className="h-3.5 w-3.5" />
																		</button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem
																			className="text-destructive focus:text-destructive"
																			onSelect={() =>
																				setDiscardConfirmFile(filepath)
																			}
																		>
																			Discard changes
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>

															{/* Discard confirmation */}
															{discardConfirmFile === filepath && (
																<div className="flex items-center justify-between gap-3 border-t bg-destructive/5 px-6 py-2.5">
																	<span className="text-xs text-destructive">
																		Discard all changes to{" "}
																		<span className="font-medium">
																			{basename}
																		</span>
																		? This cannot be undone.
																	</span>
																	<div className="flex shrink-0 items-center gap-2">
																		<Button
																			type="button"
																			variant="ghost"
																			size="sm"
																			className="h-7 px-2 text-xs"
																			onClick={() =>
																				setDiscardConfirmFile(null)
																			}
																		>
																			Cancel
																		</Button>
																		<Button
																			type="button"
																			size="sm"
																			className="h-7 bg-destructive px-2 text-xs text-destructive-foreground hover:bg-destructive/90"
																			onClick={() =>
																				handleDiscardFile(filepath)
																			}
																		>
																			Discard
																		</Button>
																	</div>
																</div>
															)}

															{/* Diff viewer */}
															{isExpanded && (
																<div className="border-t">
																	<DiffEditor
																		original={from ?? ""}
																		modified={to ?? ""}
																		language={language}
																		theme={editorTheme}
																		height="380px"
																		options={{
																			readOnly: true,
																			renderSideBySide: false,
																			minimap: { enabled: false },
																			scrollBeyondLastLine: false,
																			fontSize: 12,
																		}}
																	/>
																</div>
															)}
														</div>
													);
												},
											)}
										</div>
									)}
								</TabsContent>
							</>
						)}
					</div>

					{/* Action rows */}
					<div className="shrink-0 border-t">
						{showPreviewAction ? (
							<button
								type="button"
								className="flex w-full items-center justify-between px-6 py-3.5 text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
								onClick={() => {
									if (envUrl)
										window.open(envUrl, "_blank", "noopener,noreferrer");
								}}
								disabled={!envUrl}
							>
								<span className="flex items-center gap-3">
									<Eye className="h-4 w-4 text-muted-foreground" />
									Visit preview
								</span>
								<ArrowRight className="h-4 w-4 text-muted-foreground" />
							</button>
						) : null}
						<button
							type="button"
							className="flex w-full cursor-not-allowed items-center justify-between px-6 py-3.5 text-sm opacity-50"
							disabled
						>
							<span className="flex items-center gap-3">
								<GitPullRequest className="h-4 w-4 text-muted-foreground" />
								Open Pull Request
							</span>
							<span className="text-xs text-muted-foreground">Coming soon</span>
						</button>
					</div>

					{/* Footer */}
					<div className="shrink-0 border-t px-6 py-4">
						<div className="flex items-center gap-3">
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={() => {
									app?.sendMessage({
										role: "user",
										content: [{ type: "text", text: "/review" }],
									});
								}}
								disabled={isPublishing}
							>
								Ask review
							</Button>
							<Button
								type="button"
								className="flex-1"
								onClick={handlePublish}
								disabled={
									isPublishing ||
									isLoadingGitDiff ||
									!gitDiff ||
									Object.keys(gitDiff.diffs).length === 0
								}
							>
								{isPublishing && <Loader2 className="h-4 w-4 animate-spin" />}
								Publish
							</Button>
						</div>
						{publishError && (
							<p className="mt-2 text-xs text-destructive">{publishError}</p>
						)}
					</div>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
