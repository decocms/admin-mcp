import {
	CalendarDays,
	CalendarIcon,
	ChevronLeft,
	ChevronRight,
	Clock,
	List,
	Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	ListScheduledReleasesOutput,
	ReleaseStatus,
	ScheduledRelease,
} from "../../../api/tools/scheduled-releases.ts";

type ViewMode = "calendar" | "list";

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

const monthYearFormatter = new Intl.DateTimeFormat(undefined, {
	month: "long",
	year: "numeric",
});

// ─── date helpers ─────────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

function startOfMonth(date: Date): Date {
	const copy = startOfDay(date);
	copy.setDate(1);
	return copy;
}

function startOfWeek(date: Date, weekStartsOn = 0): Date {
	const copy = startOfDay(date);
	const offset = (copy.getDay() - weekStartsOn + 7) % 7;
	copy.setDate(copy.getDate() - offset);
	return copy;
}

function addDays(date: Date, n: number): Date {
	const copy = startOfDay(date);
	copy.setDate(copy.getDate() + n);
	return copy;
}

function addMonths(date: Date, n: number): Date {
	const copy = startOfMonth(date);
	copy.setMonth(copy.getMonth() + n);
	return copy;
}

function ymdKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function sameMonth(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function sameDay(a: Date, b: Date): boolean {
	return ymdKey(a) === ymdKey(b);
}

function isToday(date: Date): boolean {
	return sameDay(date, new Date());
}

function combineDateAndTime(date: Date, time: string | null): Date {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	if (time) {
		const [h, m] = time.split(":").map(Number);
		if (!Number.isNaN(h) && !Number.isNaN(m)) {
			result.setHours(h, m, 0, 0);
		}
	}
	return result;
}

// ─── domain helpers ───────────────────────────────────────────────────────────

function statusTone(status: ReleaseStatus): {
	label: string;
	pillClassName: string;
	barClassName: string;
	dotClassName: string;
} {
	switch (status) {
		case "live":
			return {
				label: "Live",
				pillClassName:
					"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
				barClassName:
					"bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
				dotClassName: "bg-emerald-500",
			};
		case "ended":
			return {
				label: "Ended",
				pillClassName:
					"border-muted-foreground/30 bg-muted text-muted-foreground",
				barClassName:
					"bg-muted text-muted-foreground ring-1 ring-muted-foreground/20",
				dotClassName: "bg-muted-foreground/60",
			};
		default:
			return {
				label: "Scheduled",
				pillClassName:
					"border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
				barClassName:
					"bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/30 dark:text-sky-300",
				dotClassName: "bg-sky-500",
			};
	}
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ScheduledReleasesPage() {
	const state = useMcpState();
	const initial = state.toolResult as ListScheduledReleasesOutput | undefined;
	const app = useMcpApp();

	const [releases, setReleases] = useState<ScheduledRelease[]>(
		initial?.releases ?? [],
	);
	const [view, setView] = useState<ViewMode>("calendar");
	const [currentMonth, setCurrentMonth] = useState<Date>(() =>
		startOfMonth(new Date()),
	);
	const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
		null,
	);
	const [createOpen, setCreateOpen] = useState(false);

	useEffect(() => {
		if (initial?.releases) setReleases(initial.releases);
	}, [initial?.releases]);

	// Refresh from server periodically while open so concurrent creates from
	// the file-explorer chevron flow show up here.
	useEffect(() => {
		if (!app) return;
		let cancelled = false;
		const refresh = async () => {
			try {
				const result = await app.callServerTool({
					name: "list_scheduled_releases",
					arguments: {},
				});
				const text = result?.content?.find((c) => c.type === "text");
				if (text?.type !== "text") return;
				const data = JSON.parse(text.text) as ListScheduledReleasesOutput;
				if (cancelled) return;
				setReleases(data.releases);
			} catch {
				/* non-fatal */
			}
		};
		const interval = setInterval(refresh, 5000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [app]);

	const sortedReleases = useMemo(
		() =>
			[...releases].sort((a, b) => {
				const ta = a.startDate ? new Date(a.startDate).getTime() : Infinity;
				const tb = b.startDate ? new Date(b.startDate).getTime() : Infinity;
				return ta - tb;
			}),
		[releases],
	);

	const selectedRelease =
		sortedReleases.find((r) => r.id === selectedReleaseId) ?? null;

	function handleCreated(release: ScheduledRelease) {
		setReleases((prev) => [
			...prev.filter((r) => r.id !== release.id),
			release,
		]);
		setCreateOpen(false);
		setSelectedReleaseId(release.id);
		// Move calendar to the release's start month if scheduled.
		if (release.startDate) {
			setCurrentMonth(startOfMonth(new Date(release.startDate)));
		}
	}

	const isEmpty = sortedReleases.length === 0;

	return (
		<div className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10">
			{selectedRelease ? (
				<ReleaseDetailView
					release={selectedRelease}
					onBack={() => setSelectedReleaseId(null)}
					onChanged={(updated) =>
						setReleases((prev) =>
							prev.map((r) => (r.id === updated.id ? updated : r)),
						)
					}
					onCancelled={(releaseId) => {
						setReleases((prev) => prev.filter((r) => r.id !== releaseId));
						setSelectedReleaseId(null);
					}}
				/>
			) : (
				<section className="flex flex-col gap-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0">
							<h1 className="text-xl font-medium leading-tight">Releases</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								Upcoming campaigns and permanent ships, on one timeline.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
								<TabsList>
									<TabsTrigger value="calendar" className="gap-1.5">
										<CalendarDays className="h-3.5 w-3.5" />
										Calendar
									</TabsTrigger>
									<TabsTrigger value="list" className="gap-1.5">
										<List className="h-3.5 w-3.5" />
										List
									</TabsTrigger>
								</TabsList>
							</Tabs>
							<Button
								type="button"
								size="sm"
								onClick={() => setCreateOpen(true)}
								className="gap-1.5"
							>
								<Plus className="h-3.5 w-3.5" />
								New release
							</Button>
						</div>
					</div>

					{isEmpty ? (
						<EmptyState onCreate={() => setCreateOpen(true)} />
					) : view === "calendar" ? (
						<MonthCalendar
							releases={sortedReleases}
							currentMonth={currentMonth}
							onMonthChange={setCurrentMonth}
							onSelectRelease={setSelectedReleaseId}
							selectedReleaseId={selectedReleaseId}
						/>
					) : (
						<ReleaseList
							releases={sortedReleases}
							onSelectRelease={setSelectedReleaseId}
							selectedReleaseId={selectedReleaseId}
						/>
					)}
				</section>
			)}

			<CreateReleaseDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={handleCreated}
			/>
		</div>
	);
}

// ─── empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
			<div className="rounded-full bg-muted p-3">
				<CalendarDays className="h-5 w-5 text-muted-foreground" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium">No releases yet</p>
				<p className="text-xs text-muted-foreground">
					Create one here, or schedule a change from any page editor.
				</p>
			</div>
			<Button type="button" size="sm" onClick={onCreate} className="gap-1.5">
				<Plus className="h-3.5 w-3.5" />
				New release
			</Button>
		</div>
	);
}

// ─── calendar view ────────────────────────────────────────────────────────────

interface WeekSegment {
	release: ScheduledRelease;
	startCol: number; // 1-7 inclusive
	endCol: number; // 1-7 inclusive
	continuesLeft: boolean;
	continuesRight: boolean;
	depth: number; // row offset within the week's bar stack
}

function buildWeekSegments(
	weekDays: Date[],
	releases: ScheduledRelease[],
): WeekSegment[] {
	const weekStart = weekDays[0];
	const weekEnd = weekDays[6];

	const raw: Omit<WeekSegment, "depth">[] = [];
	for (const release of releases) {
		if (!release.startDate) continue;
		const start = startOfDay(new Date(release.startDate));
		const end = release.endDate ? startOfDay(new Date(release.endDate)) : start;
		if (end < weekStart || start > weekEnd) continue;

		const segStart = start < weekStart ? weekStart : start;
		const segEnd = end > weekEnd ? weekEnd : end;
		const startCol = weekDays.findIndex((d) => sameDay(d, segStart)) + 1;
		const endCol = weekDays.findIndex((d) => sameDay(d, segEnd)) + 1;
		raw.push({
			release,
			startCol,
			endCol,
			continuesLeft: start < weekStart,
			continuesRight: end > weekEnd,
		});
	}

	raw.sort((a, b) => {
		if (a.startCol !== b.startCol) return a.startCol - b.startCol;
		const lenA = a.endCol - a.startCol;
		const lenB = b.endCol - b.startCol;
		return lenB - lenA;
	});

	const placed: WeekSegment[] = [];
	for (const seg of raw) {
		let depth = 0;
		while (
			placed.some(
				(p) =>
					p.depth === depth &&
					!(p.endCol < seg.startCol || p.startCol > seg.endCol),
			)
		) {
			depth++;
		}
		placed.push({ ...seg, depth });
	}
	return placed;
}

function MonthCalendar({
	releases,
	currentMonth,
	onMonthChange,
	onSelectRelease,
	selectedReleaseId,
}: {
	releases: ScheduledRelease[];
	currentMonth: Date;
	onMonthChange: (date: Date) => void;
	onSelectRelease: (id: string) => void;
	selectedReleaseId: string | null;
}) {
	const gridStart = useMemo(
		() => startOfWeek(startOfMonth(currentMonth)),
		[currentMonth],
	);
	const days = useMemo(
		() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
		[gridStart],
	);

	const weeks = useMemo(() => {
		const out: Date[][] = [];
		for (let i = 0; i < 6; i++) {
			out.push(days.slice(i * 7, i * 7 + 7));
		}
		return out;
	}, [days]);

	const weekdayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background">
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<h2 className="text-sm font-medium tabular-nums">
					{monthYearFormatter.format(currentMonth)}
				</h2>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onMonthChange(addMonths(currentMonth, -1))}
						aria-label="Previous month"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onMonthChange(startOfMonth(new Date()))}
					>
						Today
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onMonthChange(addMonths(currentMonth, 1))}
						aria-label="Next month"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-7 border-b border-border bg-muted/30 text-xs text-muted-foreground">
				{weekdayHeaders.map((day) => (
					<div key={day} className="px-2 py-1.5 font-medium">
						{day}
					</div>
				))}
			</div>

			<div className="divide-y divide-border">
				{weeks.map((weekDays, weekIdx) => {
					const segments = buildWeekSegments(weekDays, releases);
					const maxDepth = segments.reduce(
						(max, s) => Math.max(max, s.depth),
						-1,
					);
					// Use a constant baseline so the whole calendar is always the
					// same height regardless of how many releases fall in each week.
					// Weeks with many overlapping bars still grow beyond this.
					const minHeight = Math.max(120, 64 + (maxDepth + 1) * 24);
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: weeks are stable in a month grid
							key={weekIdx}
							className="grid grid-cols-7"
							style={{
								minHeight: `${minHeight}px`,
								gridTemplateRows: `32px repeat(${maxDepth + 1}, 24px) 1fr`,
								rowGap: 0,
							}}
						>
							{weekDays.map((day, dayIdx) => {
								const inMonth = sameMonth(day, currentMonth);
								const today = isToday(day);
								return (
									<div
										key={ymdKey(day)}
										className={cn(
											"border-r border-border px-1.5 pt-1.5 pb-1 last:border-r-0",
											!inMonth && "bg-muted/30",
										)}
										style={{
											gridColumn: `${dayIdx + 1}`,
											gridRow: "1 / -1",
										}}
									>
										<div
											className={cn(
												"flex h-5 w-5 items-center justify-center text-[11px] font-medium tabular-nums",
												!inMonth && "text-muted-foreground/60",
												today &&
													"rounded-full bg-primary text-primary-foreground",
											)}
										>
											{day.getDate()}
										</div>
									</div>
								);
							})}

							{segments.map((seg) => (
								<ReleaseBar
									key={`${seg.release.id}-${weekIdx}`}
									segment={seg}
									selected={selectedReleaseId === seg.release.id}
									onClick={() => onSelectRelease(seg.release.id)}
								/>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ReleaseBar({
	segment,
	selected,
	onClick,
}: {
	segment: WeekSegment;
	selected: boolean;
	onClick: () => void;
}) {
	const tone = statusTone(segment.release.status);
	const displayName = segment.release.name?.trim() || "Untitled release";
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"relative z-10 my-px mx-0.5 flex h-[22px] items-center gap-1.5 truncate px-2 text-left text-[11px] font-medium leading-none transition hover:brightness-95",
				tone.barClassName,
				segment.continuesLeft ? "rounded-l-none" : "rounded-l-md",
				segment.continuesRight ? "rounded-r-none" : "rounded-r-md",
				selected && "ring-2 ring-offset-1 ring-foreground/40 brightness-105",
			)}
			style={{
				gridColumnStart: segment.startCol,
				gridColumnEnd: segment.endCol + 1,
				gridRowStart: segment.depth + 2,
			}}
			title={displayName}
		>
			{!segment.continuesLeft && (
				<span
					className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dotClassName)}
				/>
			)}
			<span className="truncate">{displayName}</span>
		</button>
	);
}

// ─── list view ────────────────────────────────────────────────────────────────

function ReleaseList({
	releases,
	onSelectRelease,
	selectedReleaseId,
}: {
	releases: ScheduledRelease[];
	onSelectRelease: (id: string) => void;
	selectedReleaseId: string | null;
}) {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background">
			<div className="grid grid-cols-[180px_1fr_140px_120px] items-center gap-4 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				<span>Schedule</span>
				<span>Name</span>
				<span>Status</span>
				<span className="text-right">Changes</span>
			</div>
			<ul className="divide-y divide-border">
				{releases.map((release) => {
					const tone = statusTone(release.status);
					const selected = selectedReleaseId === release.id;
					const displayName = release.name?.trim() || "Untitled release";
					return (
						<li key={release.id}>
							<button
								type="button"
								onClick={() => onSelectRelease(release.id)}
								className={cn(
									"grid w-full grid-cols-[180px_1fr_140px_120px] items-center gap-4 px-4 py-3 text-left transition",
									selected ? "bg-muted/60" : "hover:bg-muted/30",
								)}
							>
								<div className="flex flex-col">
									{release.startDate ? (
										<>
											<span className="text-sm font-medium tabular-nums">
												{shortDateFormatter.format(new Date(release.startDate))}
											</span>
											{release.endDate && (
												<span className="text-xs text-muted-foreground tabular-nums">
													→{" "}
													{shortDateFormatter.format(new Date(release.endDate))}
												</span>
											)}
										</>
									) : (
										<span className="text-sm text-muted-foreground">
											Unscheduled
										</span>
									)}
								</div>
								<span
									className={cn(
										"truncate text-sm font-medium",
										!release.name?.trim() && "text-muted-foreground italic",
									)}
								>
									{displayName}
								</span>
								<div>
									<Badge
										variant="outline"
										className={cn("gap-1.5", tone.pillClassName)}
									>
										<span
											className={cn(
												"h-1.5 w-1.5 rounded-full",
												tone.dotClassName,
											)}
										/>
										{tone.label}
									</Badge>
								</div>
								<span className="text-right text-xs tabular-nums text-muted-foreground">
									{release.changes.length === 1
										? "1 change"
										: `${release.changes.length} changes`}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

// ─── detail view (full page with breadcrumb) ──────────────────────────────────

function ReleaseDetailView({
	release,
	onBack,
	onChanged,
	onCancelled,
}: {
	release: ScheduledRelease;
	onBack: () => void;
	onChanged: (release: ScheduledRelease) => void;
	onCancelled: (releaseId: string) => void;
}) {
	const app = useMcpApp();
	const tone = statusTone(release.status);
	const [rescheduleOpen, setRescheduleOpen] = useState(false);
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

	async function handleCancel() {
		if (!app) return;
		try {
			await app.callServerTool({
				name: "cancel_scheduled_release",
				arguments: { releaseId: release.id },
			});
			onCancelled(release.id);
			toast.success(`Cancelled "${release.name}"`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to cancel release.",
			);
		} finally {
			setConfirmCancelOpen(false);
		}
	}

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<nav
						className="flex items-center gap-2 text-xl font-medium leading-tight"
						aria-label="Breadcrumb"
					>
						<button
							type="button"
							onClick={onBack}
							className="text-muted-foreground transition-colors hover:text-foreground"
						>
							Releases
						</button>
						<ChevronRight className="h-4 w-4 text-muted-foreground/60" />
						<h1 className="truncate">{release.name}</h1>
						<Badge
							variant="outline"
							className={cn("ml-1 gap-1.5", tone.pillClassName)}
						>
							<span
								className={cn("h-1.5 w-1.5 rounded-full", tone.dotClassName)}
							/>
							{tone.label}
						</Badge>
					</nav>
					<p className="text-sm text-muted-foreground">
						{release.startDate ? (
							<>
								{longDateFormatter.format(new Date(release.startDate))}
								{release.endDate
									? ` → ${longDateFormatter.format(new Date(release.endDate))}`
									: " · permanent ship"}
							</>
						) : (
							"Not yet scheduled"
						)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setRescheduleOpen(true)}
					>
						Reschedule
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="text-destructive hover:text-destructive"
						onClick={() => setConfirmCancelOpen(true)}
					>
						Cancel release
					</Button>
				</div>
			</div>

			<RescheduleDialog
				release={release}
				open={rescheduleOpen}
				onOpenChange={setRescheduleOpen}
				onUpdated={(updated) => {
					onChanged(updated);
					setRescheduleOpen(false);
				}}
			/>
			<ConfirmCancelDialog
				release={release}
				open={confirmCancelOpen}
				onOpenChange={setConfirmCancelOpen}
				onConfirm={handleCancel}
			/>

			<div className="overflow-hidden rounded-lg border border-border bg-background">
				<div className="border-b border-border px-4 py-2.5">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Changes in this release
					</p>
				</div>
				{release.changes.length === 0 ? (
					<div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
						<p className="text-sm font-medium">No changes added yet</p>
						<p className="text-xs text-muted-foreground">
							Schedule a change from any page editor's Publish menu and pick "
							{release.name}".
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border">
						{release.changes.map((change) => (
							<li
								key={`${change.pagePath}-${change.sectionIndex}`}
								className="flex items-center gap-4 px-4 py-3"
							>
								<div className="min-w-0 flex-1 space-y-0.5">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium">
											{change.sectionLabel}
										</span>
										<span className="font-mono text-[11px] text-muted-foreground">
											{change.pagePath}
										</span>
									</div>
									{change.previewSnippet && (
										<p className="truncate text-xs text-muted-foreground">
											“{change.previewSnippet}”
										</p>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}

// ─── create dialog ────────────────────────────────────────────────────────────

function CreateReleaseDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (release: ScheduledRelease) => void;
}) {
	const app = useMcpApp();
	const [name, setName] = useState("");
	const [scheduleEnabled, setScheduleEnabled] = useState(true);
	const [startDate, setStartDate] = useState<Date | undefined>(undefined);
	const [startTime, setStartTime] = useState<string>("");
	const [endDate, setEndDate] = useState<Date | undefined>(undefined);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) {
			setName("");
			setScheduleEnabled(true);
			setStartDate(undefined);
			setStartTime("");
			setEndDate(undefined);
			setSubmitting(false);
		}
	}, [open]);

	const canSubmit =
		!!name.trim() && (!scheduleEnabled || !!startDate) && !submitting;

	async function handleSubmit() {
		if (!name.trim()) return;
		if (scheduleEnabled && !startDate) return;
		setSubmitting(true);
		try {
			const startIso =
				scheduleEnabled && startDate
					? combineDateAndTime(startDate, startTime || null).toISOString()
					: undefined;
			const endIso =
				scheduleEnabled && endDate
					? combineDateAndTime(endDate, null).toISOString()
					: undefined;
			const result = await app?.callServerTool({
				name: "create_scheduled_release",
				arguments: {
					name: name.trim(),
					startDate: startIso,
					endDate: endIso,
				},
			});
			const text = result?.content?.find((c) => c.type === "text");
			if (text?.type !== "text") {
				toast.error("Failed to create release.");
				return;
			}
			const data = JSON.parse(text.text) as { release?: ScheduledRelease };
			if (!data.release) {
				toast.error("Server did not return a release.");
				return;
			}
			onCreated(data.release);
			toast.success(`Created "${data.release.name}"`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create release.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>New release</DialogTitle>
					<DialogDescription>
						Create a release container. Add changes to it from any page editor,
						or schedule it now.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<label
							className="text-xs font-medium"
							htmlFor="create-release-name"
						>
							Name <span className="text-destructive">*</span>
						</label>
						<Input
							id="create-release-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. Black Friday"
							className="h-9 text-sm"
						/>
					</div>

					<label
						htmlFor="create-release-schedule"
						className="flex cursor-pointer items-center gap-2 text-sm"
					>
						<Checkbox
							id="create-release-schedule"
							checked={scheduleEnabled}
							onCheckedChange={(checked) =>
								setScheduleEnabled(checked === true)
							}
						/>
						<span>Schedule release</span>
					</label>

					{scheduleEnabled && (
						<div className="space-y-3">
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<label
										className="text-xs font-medium"
										htmlFor="create-release-start"
									>
										Date <span className="text-destructive">*</span>
									</label>
									<DatePickerButton
										id="create-release-start"
										value={startDate}
										onChange={setStartDate}
										placeholder="Pick a date"
									/>
								</div>
								<div className="space-y-1.5">
									<label
										className="text-xs font-medium"
										htmlFor="create-release-time"
									>
										Time{" "}
										<span className="text-muted-foreground">(optional)</span>
									</label>
									<TimePickerButton
										id="create-release-time"
										value={startTime}
										onChange={setStartTime}
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<label
									className="text-xs font-medium"
									htmlFor="create-release-end"
								>
									End date{" "}
									<span className="text-muted-foreground">(optional)</span>
								</label>
								<DatePickerButton
									id="create-release-end"
									value={endDate}
									onChange={setEndDate}
									placeholder="No end date — permanent ship"
									minDate={startDate}
								/>
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={!canSubmit}
						onClick={handleSubmit}
					>
						{submitting ? "Creating…" : "Create release"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

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
	const [open, setOpen] = useState(false);
	const formatted = value ? shortDateFormatter.format(value) : placeholder;
	const today = startOfDay(new Date());
	const before = minDate ? startOfDay(minDate) : today;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					size="sm"
					className={cn(
						"h-9 w-full justify-start text-left font-normal",
						!value && "text-muted-foreground",
					)}
				>
					<CalendarIcon className="mr-2 h-3.5 w-3.5" />
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
							setOpen(false);
						}
					}}
					disabled={{ before }}
				/>
			</PopoverContent>
		</Popover>
	);
}

const TIME_HOURS = Array.from({ length: 24 }, (_, i) => i);
const TIME_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function TimePickerButton({
	id,
	value,
	onChange,
}: {
	id: string;
	value: string;
	onChange: (time: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"hour" | "minute">("hour");

	const selectedHour = value ? Number(value.split(":")[0]) : undefined;
	const selectedMinute =
		value !== "" ? Math.round(Number(value.split(":")[1]) / 5) * 5 : undefined;

	const displayHour =
		selectedHour !== undefined ? String(selectedHour).padStart(2, "0") : "--";
	const displayMinute =
		selectedMinute !== undefined
			? String(selectedMinute).padStart(2, "0")
			: "--";

	function pickHour(h: number) {
		const m = selectedMinute ?? 0;
		onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
		setMode("minute");
	}

	function pickMinute(m: number) {
		const h = selectedHour ?? 0;
		onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
		setOpen(false);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (v) setMode("hour");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					size="sm"
					className={cn(
						"h-9 w-full justify-start text-left font-normal tabular-nums",
						!value && "text-muted-foreground",
					)}
				>
					<Clock className="mr-2 h-3.5 w-3.5" />
					{value ? `${displayHour}:${displayMinute}` : "Pick a time"}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start">
				<div className="space-y-3">
					<div className="flex items-center justify-center gap-1 font-medium tabular-nums">
						<button
							type="button"
							onClick={() => setMode("hour")}
							className={cn(
								"rounded px-2.5 py-1 text-sm transition-colors",
								mode === "hour"
									? "bg-primary text-primary-foreground"
									: "hover:bg-muted",
							)}
						>
							{displayHour}
						</button>
						<span className="text-muted-foreground">:</span>
						<button
							type="button"
							onClick={() => setMode("minute")}
							className={cn(
								"rounded px-2.5 py-1 text-sm transition-colors",
								mode === "minute"
									? "bg-primary text-primary-foreground"
									: "hover:bg-muted",
							)}
						>
							{displayMinute}
						</button>
					</div>

					{mode === "hour" ? (
						<div className="grid grid-cols-6 gap-1">
							{TIME_HOURS.map((h) => (
								<button
									key={h}
									type="button"
									onClick={() => pickHour(h)}
									className={cn(
										"flex h-8 w-8 items-center justify-center rounded text-sm tabular-nums transition-colors hover:bg-muted",
										selectedHour === h &&
											"bg-primary text-primary-foreground hover:bg-primary/90",
									)}
								>
									{String(h).padStart(2, "0")}
								</button>
							))}
						</div>
					) : (
						<div className="grid grid-cols-4 gap-1">
							{TIME_MINUTES.map((m) => (
								<button
									key={m}
									type="button"
									onClick={() => pickMinute(m)}
									className={cn(
										"flex h-8 w-full items-center justify-center rounded text-sm tabular-nums transition-colors hover:bg-muted",
										selectedMinute === m &&
											"bg-primary text-primary-foreground hover:bg-primary/90",
									)}
								>
									{String(m).padStart(2, "0")}
								</button>
							))}
						</div>
					)}

					{value && (
						<div className="border-t border-border pt-2">
							<button
								type="button"
								onClick={() => {
									onChange("");
									setOpen(false);
								}}
								className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
							>
								Clear time
							</button>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ─── reschedule dialog ────────────────────────────────────────────────────────

function RescheduleDialog({
	release,
	open,
	onOpenChange,
	onUpdated,
}: {
	release: ScheduledRelease;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdated: (release: ScheduledRelease) => void;
}) {
	const app = useMcpApp();
	const [startDate, setStartDate] = useState<Date | undefined>(undefined);
	const [endDate, setEndDate] = useState<Date | undefined>(undefined);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setStartDate(release.startDate ? new Date(release.startDate) : undefined);
			setEndDate(release.endDate ? new Date(release.endDate) : undefined);
			setSubmitting(false);
		}
	}, [open, release.startDate, release.endDate]);

	async function handleSubmit() {
		if (!app) return;
		setSubmitting(true);
		try {
			const result = await app.callServerTool({
				name: "reschedule_scheduled_release",
				arguments: {
					releaseId: release.id,
					startDate: startDate ? startDate.toISOString() : null,
					endDate: endDate ? endDate.toISOString() : null,
				},
			});
			const text = result?.content?.find((c) => c.type === "text");
			if (text?.type !== "text") {
				toast.error("Failed to reschedule.");
				return;
			}
			const data = JSON.parse(text.text) as {
				release?: ScheduledRelease | null;
			};
			if (data.release) {
				onUpdated(data.release);
				toast.success("Rescheduled");
			} else {
				toast.error("Release not found.");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to reschedule.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reschedule release</DialogTitle>
					<DialogDescription>
						Update when "{release.name}" goes live and when (or if) it ends.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<div className="space-y-1.5">
						<label className="text-xs font-medium" htmlFor="reschedule-start">
							Go live on
						</label>
						<DatePickerButton
							id="reschedule-start"
							value={startDate}
							onChange={setStartDate}
							placeholder="Pick a date"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-medium" htmlFor="reschedule-end">
							End date <span className="text-muted-foreground">(optional)</span>
						</label>
						<DatePickerButton
							id="reschedule-end"
							value={endDate}
							onChange={setEndDate}
							placeholder="No end date — permanent ship"
							minDate={startDate}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={submitting}
						onClick={handleSubmit}
					>
						{submitting ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── confirm cancel dialog ────────────────────────────────────────────────────

function ConfirmCancelDialog({
	release,
	open,
	onOpenChange,
	onConfirm,
}: {
	release: ScheduledRelease;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Cancel release?</DialogTitle>
					<DialogDescription>
						"{release.name}" and all of its{" "}
						{release.changes.length === 1
							? "1 change"
							: `${release.changes.length} changes`}{" "}
						will be removed. This can't be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Keep release
					</Button>
					<Button
						type="button"
						size="sm"
						variant="destructive"
						onClick={onConfirm}
					>
						Cancel release
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
