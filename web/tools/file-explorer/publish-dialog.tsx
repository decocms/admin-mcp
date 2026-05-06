import { DiffEditor } from "@monaco-editor/react";
import {
	CalendarClock,
	CalendarIcon,
	Check,
	ChevronRight,
	Eye,
	FileCode2,
	Loader2,
	MoreHorizontal,
	Plus,
	Sparkles,
	Trash2,
	UserCheck,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useMcpApp } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type { SuggestCommitMessageOutput } from "../../../api/tools/commit-summary.ts";
import type { GitDiffResult, GitStatus } from "../../../api/tools/git.ts";
import { getLanguageFromPath } from "./utils.ts";

// ─── types ────────────────────────────────────────────────────────────────────

export interface UpcomingRelease {
	id: string;
	name: string;
	startDate: string | null;
}

interface PublishDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userEnv: string;
	envUrl: string | null;
	showPreviewAction: boolean;
	editorTheme: "vs" | "vs-dark";
	gitStatus: GitStatus | null;
	onGitStatusChange: (status: GitStatus | null) => void;
	upcomingReleases?: UpcomingRelease[];
	onScheduled?: () => void;
	currentPagePath?: string;
	currentSectionLabel?: string;
	currentSectionIndex?: number | null;
}

const CREATE_NEW_RELEASE = "__create_new__";

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "long",
	day: "numeric",
	year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

function startOfDay(date: Date): Date {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

// ─── main dialog ──────────────────────────────────────────────────────────────

export function PublishDialog({
	open,
	onOpenChange,
	userEnv,
	envUrl,
	showPreviewAction,
	editorTheme,
	gitStatus,
	onGitStatusChange,
	upcomingReleases = [],
	onScheduled,
	currentPagePath,
	currentSectionLabel,
	currentSectionIndex,
}: PublishDialogProps) {
	const app = useMcpApp();

	const [gitDiff, setGitDiff] = useState<GitDiffResult | null>(null);
	const [isLoadingGitDiff, setIsLoadingGitDiff] = useState(false);
	const [expandedDiffFile, setExpandedDiffFile] = useState<string | null>(null);
	const [isPublishing, setIsPublishing] = useState(false);
	const [publishTitle, setPublishTitle] = useState("");
	const [publishBody, setPublishBody] = useState("");
	const [publishError, setPublishError] = useState<string>();
	const [discardConfirmFile, setDiscardConfirmFile] = useState<string | null>(
		null,
	);
	const [suggestion, setSuggestion] =
		useState<SuggestCommitMessageOutput | null>(null);
	const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);

	// human review (PR)
	const [isOpeningReview, setIsOpeningReview] = useState(false);
	const [openedReview, setOpenedReview] = useState<{
		number: number;
		html_url: string;
	} | null>(null);
	const [reviewError, setReviewError] = useState<string>();

	// release picker
	const [showReleasePicker, setShowReleasePicker] = useState(false);
	const [releaseSelection, setReleaseSelection] = useState<string>("");
	const [newReleaseName, setNewReleaseName] = useState("");
	const [newReleaseStartDate, setNewReleaseStartDate] = useState<
		Date | undefined
	>(undefined);
	const [newReleaseEndDate, setNewReleaseEndDate] = useState<Date | undefined>(
		undefined,
	);

	const isCreatingNewRelease = releaseSelection === CREATE_NEW_RELEASE;
	const selectedExistingRelease = !isCreatingNewRelease
		? upcomingReleases.find((r) => r.id === releaseSelection)
		: undefined;
	const canConfirmSchedule = isCreatingNewRelease
		? !!newReleaseName.trim() && !!newReleaseStartDate
		: !!selectedExistingRelease;

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
		setSuggestion(null);
		setPublishTitle("");
		setPublishBody("");
		setReleaseSelection("");
		setNewReleaseName("");
		setNewReleaseStartDate(undefined);
		setNewReleaseEndDate(undefined);
		setShowReleasePicker(false);
		setOpenedReview(null);
		setReviewError(undefined);

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

		setIsGeneratingSuggestion(true);
		app
			.callServerTool({
				name: "suggest_commit_message",
				arguments: { env: userEnv },
			})
			.then((result) => {
				if (cancelled) return;
				if (result && !result.isError) {
					const data = result.structuredContent as
						| SuggestCommitMessageOutput
						| undefined;
					if (data) {
						setSuggestion(data);
						setPublishTitle((prev) => prev || data.title);
						setPublishBody((prev) => prev || data.body);
					}
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setIsGeneratingSuggestion(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (isPublishing) return;
		onOpenChange(nextOpen);
		if (!nextOpen) {
			setExpandedDiffFile(null);
			setShowReleasePicker(false);
		}
	};

	// ─── publish now ────────────────────────────────────────────────────────────

	const handlePublish = async () => {
		if (!app || !userEnv) return;
		setIsPublishing(true);
		setPublishError(undefined);

		try {
			const commitMessage = [publishTitle.trim(), publishBody.trim()]
				.filter(Boolean)
				.join("\n\n");

			const result = await app.callServerTool({
				name: "git_publish",
				arguments: {
					env: userEnv,
					...(commitMessage ? { message: commitMessage } : {}),
				},
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to publish",
				);
			}

			toast.success("Published successfully!");
			onOpenChange(false);
			setGitDiff(null);
			setPublishTitle("");
			setPublishBody("");

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

	// ─── schedule into release ───────────────────────────────────────────────────

	const handleSchedule = async () => {
		if (!app || !userEnv) return;
		setIsPublishing(true);
		setPublishError(undefined);

		try {
			let releaseId = releaseSelection;
			let releaseLabel = "";

			if (isCreatingNewRelease) {
				if (!newReleaseName.trim() || !newReleaseStartDate) return;
				const result = await app.callServerTool({
					name: "create_scheduled_release",
					arguments: {
						name: newReleaseName.trim(),
						startDate: newReleaseStartDate.toISOString(),
						endDate: newReleaseEndDate?.toISOString(),
					},
				});
				if (result?.isError) {
					const text = result.content?.find((b) => b.type === "text");
					throw new Error(
						text?.type === "text" ? text.text : "Failed to create release",
					);
				}
				const data = result?.structuredContent as
					| { release?: { id: string; name: string } }
					| undefined;
				if (!data?.release) throw new Error("Server did not return a release.");
				releaseId = data.release.id;
				releaseLabel = data.release.name;
			} else {
				releaseLabel = selectedExistingRelease?.name ?? "release";
			}

			const addResult = await app.callServerTool({
				name: "add_change_to_release",
				arguments: {
					env: userEnv,
					releaseId,
					pagePath: currentPagePath ?? "/",
					sectionLabel: currentSectionLabel ?? "Section",
					sectionIndex: currentSectionIndex ?? 0,
				},
			});
			if (addResult?.isError) {
				const text = addResult.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text"
						? text.text
						: "Failed to attach change to release",
				);
			}

			toast.success(`Added to "${releaseLabel}"`);
			onScheduled?.();
			setShowReleasePicker(false);
			onOpenChange(false);
		} catch (error) {
			setPublishError(
				error instanceof Error ? error.message : "Failed to schedule",
			);
		} finally {
			setIsPublishing(false);
		}
	};

	// ─── human review ───────────────────────────────────────────────────────────

	const handleOpenReview = async () => {
		if (!app || !userEnv) return;
		setIsOpeningReview(true);
		setReviewError(undefined);
		try {
			const reviewTitle =
				publishTitle.trim() || suggestion?.title || `Changes from ${userEnv}`;
			const reviewBody = publishBody.trim() || suggestion?.body || undefined;
			const branch =
				suggestion?.branch ?? userEnv.toLowerCase().replace(/[^a-z0-9-]/g, "-");

			const result = await app.callServerTool({
				name: "open_pull_request",
				arguments: {
					env: userEnv,
					title: reviewTitle,
					body: reviewBody,
					branch,
					base: "main",
				},
			});
			if (result?.isError) {
				const text = result.content?.find((b) => b.type === "text");
				throw new Error(
					text?.type === "text" ? text.text : "Failed to send for review",
				);
			}
			const data = result?.structuredContent as
				| { number: number; html_url: string }
				| undefined;
			if (data) {
				setOpenedReview(data);
				toast.success("Sent for human review");
			}
		} catch (error) {
			setReviewError(
				error instanceof Error ? error.message : "Failed to send for review",
			);
		} finally {
			setIsOpeningReview(false);
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
	const hasChanges =
		!isLoadingGitDiff && !!gitDiff && Object.keys(gitDiff.diffs).length > 0;

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="top-14 left-auto right-4 translate-x-0 flex max-h-[85vh] w-[90vw] max-w-[560px] h-[90%] translate-y-0 flex-col gap-0 overflow-hidden p-0">
					<Tabs
						defaultValue="description"
						className="flex h-full flex-col gap-0"
					>
						{/* ── Header ── */}
						<div className="shrink-0 px-6 pt-6 pb-4">
							<div className="flex items-start justify-between gap-3 mb-5">
								<div>
									<h2 className="text-base font-semibold leading-none">
										Publish changes
									</h2>
									<p className="mt-1.5 text-sm text-muted-foreground">
										{isLoadingGitDiff
											? "Loading…"
											: diffCount === 0
												? "No changes to publish"
												: `${diffCount} ${diffCount === 1 ? "file" : "files"} changed`}
									</p>
								</div>
								{!isLoadingGitDiff && diffCount > 0 && (
									<span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800/50">
										<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
										Pending
									</span>
								)}
							</div>
							<TabsList className="h-9 w-full rounded-lg">
								<TabsTrigger value="description" className="flex-1 text-xs">
									Description
								</TabsTrigger>
								<TabsTrigger value="changes" className="flex-1 text-xs">
									Changed files
									{diffCount > 0 && (
										<span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums leading-none">
											{diffCount}
										</span>
									)}
								</TabsTrigger>
							</TabsList>
						</div>

						<Separator />

						{/* ── Scrollable body ── */}
						<div className="min-h-0 flex-1 overflow-y-auto">
							{isLoadingGitDiff ? (
								<div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
									<Loader2 className="h-5 w-5 animate-spin" />
									<span className="text-sm">Loading changes…</span>
								</div>
							) : (
								<>
									{/* ── Description tab ── */}
									<TabsContent value="description" className="mt-0 px-6 py-6">
										<div className="space-y-5">
											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<label
														htmlFor="publish-title"
														className="text-sm font-medium"
													>
														What changed?
													</label>
													<button
														type="button"
														className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
														disabled={isGeneratingSuggestion || isPublishing}
														onClick={() => {
															if (!app || !userEnv) return;
															setSuggestion(null);
															setIsGeneratingSuggestion(true);
															app
																.callServerTool({
																	name: "suggest_commit_message",
																	arguments: { env: userEnv },
																})
																.then((result) => {
																	if (result && !result.isError) {
																		const data = result.structuredContent as
																			| SuggestCommitMessageOutput
																			| undefined;
																		if (data) {
																			setSuggestion(data);
																			setPublishTitle(data.title);
																			setPublishBody(data.body);
																		}
																	}
																})
																.catch(() => {})
																.finally(() =>
																	setIsGeneratingSuggestion(false),
																);
														}}
													>
														{isGeneratingSuggestion ? (
															<Loader2 className="h-3 w-3 animate-spin" />
														) : (
															<Sparkles className="h-3 w-3" />
														)}
														{isGeneratingSuggestion ? "Thinking…" : "Suggest"}
													</button>
												</div>
												<Input
													id="publish-title"
													value={publishTitle}
													onChange={(e) => setPublishTitle(e.target.value)}
													placeholder={
														isGeneratingSuggestion
															? "Generating…"
															: "Brief summary of what changed…"
													}
													disabled={isPublishing}
													className="text-sm"
												/>
											</div>

											<div className="space-y-2">
												<label
													htmlFor="publish-body"
													className="flex items-baseline gap-1.5 text-sm font-medium"
												>
													Details
													<span className="text-xs font-normal text-muted-foreground">
														optional
													</span>
												</label>
												<Textarea
													id="publish-body"
													value={publishBody}
													onChange={(e) => setPublishBody(e.target.value)}
													placeholder={
														isGeneratingSuggestion
															? "Generating…"
															: "Any additional context for your team…"
													}
													disabled={isPublishing}
													rows={5}
													className="resize-none text-sm"
												/>
											</div>
										</div>
									</TabsContent>

									{/* ── Changed files tab ── */}
									<TabsContent value="changes" className="mt-0">
										{gitDiff && Object.keys(gitDiff.diffs).length === 0 && (
											<div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
												<FileCode2 className="h-8 w-8 opacity-30" />
												<p className="text-sm">No files changed</p>
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
														const statusColor = isNew
															? "bg-emerald-500"
															: isDeleted
																? "bg-red-500"
																: "bg-amber-500";
														const statusLabel = isNew
															? "Added"
															: isDeleted
																? "Removed"
																: "Modified";

														return (
															<div key={filepath}>
																<div className="group flex items-center gap-3 px-6 py-3.5 hover:bg-muted/30">
																	<button
																		type="button"
																		className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
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
																			"h-2 w-2 shrink-0 rounded-full",
																			statusColor,
																		)}
																		title={statusLabel}
																	/>
																	<div className="min-w-0 flex-1">
																		<span className="text-sm font-medium">
																			{basename}
																		</span>
																		{directory && (
																			<span className="ml-2 text-xs text-muted-foreground">
																				{directory}
																			</span>
																		)}
																	</div>
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<button
																				type="button"
																				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
																			>
																				<MoreHorizontal className="h-3.5 w-3.5" />
																			</button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuItem
																				className="gap-2 text-destructive focus:text-destructive"
																				onSelect={() =>
																					setDiscardConfirmFile(filepath)
																				}
																			>
																				<Trash2 className="h-3.5 w-3.5" />
																				Discard changes
																			</DropdownMenuItem>
																		</DropdownMenuContent>
																	</DropdownMenu>
																</div>

																{discardConfirmFile === filepath && (
																	<div className="flex items-center justify-between gap-3 border-t bg-destructive/5 px-6 py-3">
																		<span className="text-xs text-destructive">
																			Discard all changes to{" "}
																			<span className="font-semibold">
																				{basename}
																			</span>
																			? This cannot be undone.
																		</span>
																		<div className="flex shrink-0 items-center gap-2">
																			<Button
																				type="button"
																				variant="ghost"
																				size="sm"
																				className="h-7 px-2.5 text-xs"
																				onClick={() =>
																					setDiscardConfirmFile(null)
																				}
																			>
																				Cancel
																			</Button>
																			<Button
																				type="button"
																				size="sm"
																				className="h-7 bg-destructive px-2.5 text-xs text-destructive-foreground hover:bg-destructive/90"
																				onClick={() =>
																					handleDiscardFile(filepath)
																				}
																			>
																				Discard
																			</Button>
																		</div>
																	</div>
																)}

																{isExpanded && (
																	<div className="border-t">
																		<DiffEditor
																			original={from ?? ""}
																			modified={to ?? ""}
																			language={language}
																			theme={editorTheme}
																			height="360px"
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

						{/* ── Utility strip ── */}
						{(showPreviewAction || hasChanges) && (
							<>
								<Separator />
								<div className="shrink-0 flex items-center gap-1 px-4 py-2">
									{showPreviewAction && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
											onClick={() => {
												if (envUrl)
													window.open(envUrl, "_blank", "noopener,noreferrer");
											}}
											disabled={!envUrl}
										>
											<Eye className="h-3.5 w-3.5" />
											Preview
										</Button>
									)}
									{hasChanges && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
											disabled={isPublishing}
											onClick={() => {
												app?.sendMessage({
													role: "user",
													content: [{ type: "text", text: "/review" }],
												});
											}}
										>
											<Sparkles className="h-3.5 w-3.5" />
											AI review
										</Button>
									)}
									{hasChanges &&
										(openedReview ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-7 gap-1.5 px-2.5 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
												onClick={() =>
													window.open(
														openedReview.html_url,
														"_blank",
														"noopener,noreferrer",
													)
												}
											>
												<Check className="h-3.5 w-3.5" />
												Review #{openedReview.number}
											</Button>
										) : (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
												disabled={isPublishing || isOpeningReview}
												onClick={handleOpenReview}
											>
												{isOpeningReview ? (
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
												) : (
													<UserCheck className="h-3.5 w-3.5" />
												)}
												{isOpeningReview ? "Sending…" : "Human review"}
											</Button>
										))}
								</div>
								{reviewError && (
									<p className="px-4 pb-2 text-xs text-destructive">
										{reviewError}
									</p>
								)}
							</>
						)}

						{/* ── Footer: two primary actions ── */}
						<Separator />
						<div className="shrink-0 px-4 py-4">
							{publishError && (
								<p className="mb-3 rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">
									{publishError}
								</p>
							)}
							<div className="flex gap-2.5">
								<Button
									type="button"
									variant="outline"
									className="flex-1 gap-2"
									onClick={() => {
										setReleaseSelection(
											upcomingReleases.length === 0 ? CREATE_NEW_RELEASE : "",
										);
										setNewReleaseName("");
										setNewReleaseStartDate(undefined);
										setNewReleaseEndDate(undefined);
										setPublishError(undefined);
										setShowReleasePicker(true);
									}}
									disabled={isPublishing || isLoadingGitDiff || !hasChanges}
								>
									<CalendarClock className="h-4 w-4 shrink-0" />
									Add to release
								</Button>
								<Button
									type="button"
									className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
									onClick={handlePublish}
									disabled={isPublishing || isLoadingGitDiff || !hasChanges}
								>
									{isPublishing ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Zap className="h-4 w-4 shrink-0" />
									)}
									{isPublishing ? "Publishing…" : "Publish now"}
								</Button>
							</div>
						</div>
					</Tabs>
				</DialogContent>
			</Dialog>

			{/* ── Release picker ── */}
			<ReleasePickerDialog
				open={showReleasePicker}
				onOpenChange={setShowReleasePicker}
				upcomingReleases={upcomingReleases}
				releaseSelection={releaseSelection}
				onReleaseSelectionChange={setReleaseSelection}
				newReleaseName={newReleaseName}
				onNewReleaseNameChange={setNewReleaseName}
				newReleaseStartDate={newReleaseStartDate}
				onNewReleaseStartDateChange={setNewReleaseStartDate}
				newReleaseEndDate={newReleaseEndDate}
				onNewReleaseEndDateChange={setNewReleaseEndDate}
				isPublishing={isPublishing}
				publishError={publishError}
				canConfirmSchedule={canConfirmSchedule}
				isCreatingNewRelease={isCreatingNewRelease}
				selectedExistingRelease={selectedExistingRelease}
				onSchedule={handleSchedule}
			/>
		</>
	);
}

// ─── release picker dialog ─────────────────────────────────────────────────────

interface ReleasePickerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	upcomingReleases: UpcomingRelease[];
	releaseSelection: string;
	onReleaseSelectionChange: (id: string) => void;
	newReleaseName: string;
	onNewReleaseNameChange: (name: string) => void;
	newReleaseStartDate: Date | undefined;
	onNewReleaseStartDateChange: (date: Date) => void;
	newReleaseEndDate: Date | undefined;
	onNewReleaseEndDateChange: (date: Date) => void;
	isPublishing: boolean;
	publishError: string | undefined;
	canConfirmSchedule: boolean;
	isCreatingNewRelease: boolean;
	selectedExistingRelease: UpcomingRelease | undefined;
	onSchedule: () => void;
}

function ReleasePickerDialog({
	open,
	onOpenChange,
	upcomingReleases,
	releaseSelection,
	onReleaseSelectionChange,
	newReleaseName,
	onNewReleaseNameChange,
	newReleaseStartDate,
	onNewReleaseStartDateChange,
	newReleaseEndDate,
	onNewReleaseEndDateChange,
	isPublishing,
	publishError,
	canConfirmSchedule,
	isCreatingNewRelease,
	selectedExistingRelease,
	onSchedule,
}: ReleasePickerDialogProps) {
	const hasExisting = upcomingReleases.length > 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px] gap-0 p-0">
				<DialogHeader className="px-6 pt-6 pb-5 text-left">
					<DialogTitle className="text-base font-semibold">
						{hasExisting ? "Add to a release" : "Create a release"}
					</DialogTitle>
					<DialogDescription className="text-sm">
						{hasExisting
							? "Choose a release or create a new one."
							: "Set a date for when these changes should go live."}
					</DialogDescription>
				</DialogHeader>

				<Separator />

				<div className="px-6 pt-5 pb-6 space-y-5">
					{/* Existing releases */}
					{hasExisting && (
						<div className="space-y-2">
							{upcomingReleases.map((release) => {
								const isSelected = releaseSelection === release.id;
								return (
									<button
										key={release.id}
										type="button"
										onClick={() => onReleaseSelectionChange(release.id)}
										className={cn(
											"w-full flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all",
											isSelected
												? "border-ring/50 bg-accent shadow-sm"
												: "border-border/60 hover:border-border hover:bg-muted/30",
										)}
									>
										<div
											className={cn(
												"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
												isSelected ? "bg-primary/10" : "bg-muted",
											)}
										>
											<CalendarClock
												className={cn(
													"h-4.5 w-4.5",
													isSelected ? "text-primary" : "text-muted-foreground",
												)}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium leading-none">
												{release.name}
											</p>
											{release.startDate && (
												<p className="mt-1 text-xs text-muted-foreground">
													Goes live{" "}
													{longDateFormatter.format(
														new Date(release.startDate),
													)}
												</p>
											)}
										</div>
										<div
											className={cn(
												"h-4 w-4 shrink-0 rounded-full border-2 transition-all",
												isSelected
													? "border-primary bg-primary"
													: "border-muted-foreground/30",
											)}
										>
											{isSelected && (
												<div className="flex h-full w-full items-center justify-center">
													<div className="h-1.5 w-1.5 rounded-full bg-white" />
												</div>
											)}
										</div>
									</button>
								);
							})}
						</div>
					)}

					{/* Create new release — flat fields, no wrapper card */}
					{hasExisting && !isCreatingNewRelease ? (
						<button
							type="button"
							onClick={() => onReleaseSelectionChange(CREATE_NEW_RELEASE)}
							className="flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							<Plus className="h-4 w-4 shrink-0" />
							Create a new release
						</button>
					) : (
						<div className="space-y-4">
							{hasExisting && (
								<div className="flex items-center justify-between">
									<p className="text-sm font-semibold">New release</p>
									<button
										type="button"
										onClick={() => onReleaseSelectionChange("")}
										className="text-xs text-muted-foreground transition-colors hover:text-foreground"
									>
										Cancel
									</button>
								</div>
							)}

							<div className="space-y-1.5">
								<label
									htmlFor="release-name"
									className="text-xs font-medium text-muted-foreground"
								>
									Release name
								</label>
								<Input
									id="release-name"
									value={newReleaseName}
									onChange={(e) => onNewReleaseNameChange(e.target.value)}
									placeholder="e.g. Summer Campaign, Black Friday…"
									className="text-sm"
									// biome-ignore lint/a11y/noAutofocus: intentional — modal opened by user action
									autoFocus
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<label
										htmlFor="picker-start"
										className="text-xs font-medium text-muted-foreground"
									>
										Goes live{" "}
										<span className="text-destructive" aria-hidden="true">
											*
										</span>
									</label>
									<DatePickerButton
										id="picker-start"
										value={newReleaseStartDate}
										onChange={onNewReleaseStartDateChange}
										placeholder="Pick a date"
									/>
								</div>
								<div className="space-y-1.5">
									<label
										htmlFor="picker-end"
										className="text-xs font-medium text-muted-foreground"
									>
										Ends{" "}
										<span className="font-normal text-muted-foreground/70">
											(optional)
										</span>
									</label>
									<DatePickerButton
										id="picker-end"
										value={newReleaseEndDate}
										onChange={onNewReleaseEndDateChange}
										placeholder="No end date"
										minDate={newReleaseStartDate}
									/>
								</div>
							</div>
						</div>
					)}

					{publishError && (
						<p className="rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">
							{publishError}
						</p>
					)}

					<Button
						type="button"
						className="w-full gap-2"
						disabled={!canConfirmSchedule || isPublishing}
						onClick={onSchedule}
					>
						{isPublishing ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<CalendarClock className="h-4 w-4 shrink-0" />
						)}
						{isPublishing
							? "Saving…"
							: isCreatingNewRelease
								? "Create release & schedule"
								: selectedExistingRelease
									? `Schedule for "${selectedExistingRelease.name}"`
									: "Pick a release"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ─── date picker button ────────────────────────────────────────────────────────

function DatePickerButton({
	id,
	value,
	onChange,
	placeholder,
	minDate,
}: {
	id: string;
	value: Date | undefined;
	onChange: (date: Date) => void;
	placeholder: string;
	minDate?: Date;
}) {
	const [calOpen, setCalOpen] = useState(false);
	const formatted = value ? shortDateFormatter.format(value) : placeholder;
	const today = startOfDay(new Date());
	const before = minDate ? startOfDay(minDate) : today;

	return (
		<Popover open={calOpen} onOpenChange={setCalOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					size="sm"
					className={cn(
						"h-9 w-full justify-start gap-2 text-left font-normal",
						!value && "text-muted-foreground",
					)}
				>
					<CalendarIcon className="h-3.5 w-3.5 shrink-0" />
					{formatted}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={value}
					onSelect={(date) => {
						if (date) {
							onChange(date);
							setCalOpen(false);
						}
					}}
					disabled={{ before }}
				/>
			</PopoverContent>
		</Popover>
	);
}
