import { ArrowLeft, Filter, FlaskConical, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";

// ─── types (mirror the experiment_results tool output) ────────────────────────

interface Experiment {
	id: number;
	name: string;
	status?: string | null;
	startedAt?: string | null;
	endedAt?: string | null;
	custom_goals?: string[] | null;
}

interface ExperimentsToolResult {
	sitename: string;
	hostname: string;
	domains: string[];
	experiments: Experiment[];
	error?: string;
}

interface GoalCount {
	goal: string;
	default: number;
	variant: number;
}

interface ResultsData {
	visitors: { default: number; variant: number };
	goals: GoalCount[];
	timeseries: { date: string; default: number; variant: number }[];
	stats: {
		totalParticipants: number;
		sampleSize: number;
		probabilityVariantBest: number;
		probabilityDefaultBest: number;
	};
}

type Period = "day" | "7d" | "30d" | "month" | "6mo" | "12mo" | "custom";

// ─── constants (kept in sync with the admin Experiments view) ─────────────────

const DEFAULT_COLOR = "#05DAA7";
const VARIANT_COLOR = "#CA7AD1";

const PERIOD_LABELS: Record<Period, string> = {
	day: "Day",
	"7d": "Last Week",
	"30d": "Last 30 Days",
	month: "Current Month",
	"6mo": "Last 6 Months",
	"12mo": "Last Year",
	custom: "Custom Date",
};

const PERIODS: Period[] = [
	"day",
	"7d",
	"30d",
	"month",
	"6mo",
	"12mo",
	"custom",
];

const DEFAULT_GOALS = [
	"visitors",
	"view_item_list",
	"view_item",
	"select_promotion",
	"add_to_cart",
	"begin_checkout",
	"Visit /checkout",
	"Visit /checkout#/cart",
	"Visit /checkout#/shipping",
	"Visit /checkout#/profile",
	"Visit /checkout#/email",
	"Visit /checkout#/payment",
	"Visit /checkout/orderPlaced",
];

const DEFAULT_ACTIVE_GOALS = [
	"visitors",
	"view_item",
	"Visit /checkout/orderPlaced",
];

const DEVICES = ["Mobile", "Desktop", "Tablet"];
const BROWSERS = [
	"Chrome",
	"Mobile App",
	"Safari",
	"Samsung Browser",
	"Microsoft Edge",
	"Firefox",
	"Other",
];
const OS = ["Android", "iOS", "Windows", "Mac"];

// ─── variant tags ─────────────────────────────────────────────────────────────

function VariantTag({ variant }: { variant: "A" | "B" }) {
	return (
		<span
			className="flex justify-center items-center w-5 h-5 rounded-full text-xs text-background font-medium"
			style={{ background: variant === "A" ? DEFAULT_COLOR : VARIANT_COLOR }}
		>
			{variant}
		</span>
	);
}

// ─── multi-select filter dropdown ─────────────────────────────────────────────

function FilterDropdown({
	label,
	options,
	selected,
	onToggle,
}: {
	label: string;
	options: string[];
	selected: string[];
	onToggle: (value: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					{label}
					{selected.length > 0 ? ` (${selected.length})` : ""}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuLabel>{label}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option}
						checked={selected.includes(option)}
						onCheckedChange={() => onToggle(option)}
						onSelect={(e) => e.preventDefault()}
					>
						{option}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ─── list view ────────────────────────────────────────────────────────────────

function formatDate(value?: string | null): string {
	if (!value) return "-";
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

function ExperimentsList({
	experiments,
	onSelect,
	sitename,
	error,
}: {
	experiments: Experiment[];
	onSelect: (experiment: Experiment) => void;
	sitename?: string;
	error?: string;
}) {
	if (!experiments.length) {
		return (
			<div className="h-64 flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-xl text-muted-foreground">
				<FlaskConical className="w-8 h-8" />
				{error ? (
					<>
						<p className="text-sm text-destructive">
							Couldn't load experiments.
						</p>
						<p className="text-xs max-w-md text-center break-words">{error}</p>
					</>
				) : (
					<p className="text-sm">
						No experiments found for site{" "}
						<span className="font-medium">{sitename ?? "?"}</span>.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="border border-border rounded-lg overflow-hidden">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Created</TableHead>
						<TableHead>Ended</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{experiments.map((experiment) => (
						<TableRow
							key={experiment.id}
							className="cursor-pointer"
							onClick={() => onSelect(experiment)}
						>
							<TableCell className="font-medium">{experiment.name}</TableCell>
							<TableCell className="text-muted-foreground">
								{formatDate(experiment.startedAt)}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{formatDate(experiment.endedAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// ─── results view ─────────────────────────────────────────────────────────────

interface Goal {
	name: string;
	active: boolean;
}

function sortByTotal(goals: GoalCount[]): GoalCount[] {
	return [...goals].sort(
		(a, b) => b.default + b.variant - (a.default + a.variant),
	);
}

function percentage(part: number, total: number): number {
	if (!part || !total) return 0;
	return Number(((part / total) * 100).toFixed(2));
}

function ResultsView({
	experiment,
	domains,
	initialHostname,
	callTool,
}: {
	experiment: Experiment;
	domains: string[];
	initialHostname: string;
	callTool: <T>(
		name: string,
		args: Record<string, unknown>,
	) => Promise<T | null>;
	onBack: () => void;
}) {
	const [hostname, setHostname] = useState(initialHostname);
	const [period, setPeriod] = useState<Period>("30d");
	const [customFrom, setCustomFrom] = useState("");
	const [customTo, setCustomTo] = useState("");
	const [showFilters, setShowFilters] = useState(false);
	const [devices, setDevices] = useState<string[]>([]);
	const [browsers, setBrowsers] = useState<string[]>([]);
	const [os, setOs] = useState<string[]>([]);

	const [goals, setGoals] = useState<Goal[]>(() =>
		[...DEFAULT_GOALS, ...(experiment.custom_goals ?? [])].map((name) => ({
			name,
			active:
				DEFAULT_ACTIVE_GOALS.includes(name) ||
				(experiment.custom_goals ?? []).includes(name) ||
				name === "visitors",
		})),
	);
	const [goalOnDash, setGoalOnDash] = useState("begin_checkout");

	const [data, setData] = useState<ResultsData | null>(null);
	const [loading, setLoading] = useState(true);

	const activeGoals = useMemo(
		() => goals.filter((g) => g.active).map((g) => g.name),
		[goals],
	);
	// Serialize for stable effect deps without re-fetching on identity changes.
	const activeGoalsKey = activeGoals.join(",");
	const filtersKey = `${devices.join(",")}|${browsers.join(",")}|${os.join(",")}`;

	useEffect(() => {
		if (!hostname) return;
		if (period === "custom" && (!customFrom || !customTo)) return;

		let cancelled = false;
		setLoading(true);

		const dateRange =
			period === "custom"
				? { type: "custom" as const, from: customFrom, to: customTo }
				: { type: "preset" as const, value: period };

		callTool<ResultsData>("experiment_results", {
			hostname,
			testName: experiment.name,
			dateRange,
			goals: activeGoals,
			goalOnDash,
			filters: { devices, browsers, os },
		}).then((result) => {
			if (cancelled) return;
			setData(result);
			setLoading(false);
		});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		hostname,
		period,
		customFrom,
		customTo,
		activeGoalsKey,
		filtersKey,
		goalOnDash,
		experiment.name,
		callTool,
	]);

	// Tables (Funnel / By Goal) show every goal including the visitors baseline,
	// matching the admin. The bar chart drops visitors (its conversion would
	// always be 100% and would flatten the other goals).
	const sortedGoals = useMemo(
		() => (data ? sortByTotal(data.goals) : []),
		[data],
	);

	const stats = data?.stats;
	const visitors = data?.visitors ?? { default: 0, variant: 0 };
	const sampleSize = stats?.sampleSize ?? 1000;
	const progress = stats
		? Math.min(100, (stats.totalParticipants / (sampleSize || 1000)) * 100)
		: 0;

	const toggle = useCallback(
		(setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
			setter((prev) =>
				prev.includes(value)
					? prev.filter((v) => v !== value)
					: [...prev, value],
			),
		[],
	);

	const timeseriesData =
		data?.timeseries.map((point) => ({
			date: point.date,
			Default: point.default,
			"Test Variant 1": point.variant,
		})) ?? [];

	const barData = sortedGoals
		.filter((g) => g.goal !== "visitors")
		.map((g) => ({
			goal: g.goal,
			Default: percentage(g.default, visitors.default),
			"Test Variant 1": percentage(g.variant, visitors.variant),
		}));

	return (
		<div className="flex flex-col gap-6">
			{/* header */}
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2">
					<span className="text-lg font-semibold">{experiment.name}</span>
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					{domains.length > 0 && (
						<Select value={hostname} onValueChange={setHostname}>
							<SelectTrigger className="w-[200px]">
								<SelectValue placeholder="Domain" />
							</SelectTrigger>
							<SelectContent>
								{domains.map((domain) => (
									<SelectItem key={domain} value={domain}>
										{domain}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					<Select
						value={period}
						onValueChange={(value) => setPeriod(value as Period)}
					>
						<SelectTrigger className="w-[160px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PERIODS.map((p) => (
								<SelectItem key={p} value={p}>
									{PERIOD_LABELS[p]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant={showFilters ? "default" : "outline"}
						size="icon"
						onClick={() => setShowFilters((v) => !v)}
					>
						<Filter className="w-4 h-4" />
					</Button>
				</div>
			</div>

			{period === "custom" && (
				<div className="flex items-center gap-2">
					<input
						type="date"
						value={customFrom}
						max={customTo || undefined}
						onChange={(e) => setCustomFrom(e.target.value)}
						className="border border-border rounded-md px-2 py-1 text-sm bg-background"
					/>
					<span className="text-muted-foreground">→</span>
					<input
						type="date"
						value={customTo}
						min={customFrom || undefined}
						onChange={(e) => setCustomTo(e.target.value)}
						className="border border-border rounded-md px-2 py-1 text-sm bg-background"
					/>
				</div>
			)}

			{showFilters && (
				<div className="flex gap-2 flex-wrap">
					<FilterDropdown
						label="Devices"
						options={DEVICES}
						selected={devices}
						onToggle={(v) => toggle(setDevices, v)}
					/>
					<FilterDropdown
						label="Browsers"
						options={BROWSERS}
						selected={browsers}
						onToggle={(v) => toggle(setBrowsers, v)}
					/>
					<FilterDropdown
						label="OS"
						options={OS}
						selected={os}
						onToggle={(v) => toggle(setOs, v)}
					/>
				</div>
			)}

			{/* progress card */}
			<Card>
				<CardContent className="flex items-start justify-between gap-8 p-4">
					<FlaskConical className="w-6 h-6 text-primary shrink-0" />
					<div className="flex flex-col gap-1 min-w-[40%]">
						<p className="font-semibold">Experiment in progress</p>
						<p className="text-sm text-muted-foreground">
							It's too early to tell which variant is better as the results are
							not statistically significant and may still change.
						</p>
					</div>
					<div className="flex flex-col gap-2 w-full">
						<div className="flex justify-between text-sm">
							<span>
								{loading ? "…" : (stats?.totalParticipants ?? 0)} participants
								have seen
							</span>
							<span>
								Goal: {loading ? "…" : sampleSize.toFixed()} participants
							</span>
						</div>
						<Progress value={progress} />
					</div>
				</CardContent>
			</Card>

			{/* variant probability + timeseries */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold">Variant results</h3>
					<Select value={goalOnDash} onValueChange={setGoalOnDash}>
						<SelectTrigger className="w-[200px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{goals
								.filter((g) => g.name !== "visitors")
								.map((g) => (
									<SelectItem key={g.name} value={g.name}>
										{g.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				</div>
				<Card>
					<CardContent className="flex items-start gap-4 p-4 h-[320px]">
						<div className="flex flex-col gap-6 w-1/3">
							<ProbabilityBlock
								variant="A"
								label="Default"
								probability={stats?.probabilityDefaultBest ?? 0}
								color={DEFAULT_COLOR}
								loading={loading}
							/>
							<ProbabilityBlock
								variant="B"
								label="Test Variant 1"
								probability={stats?.probabilityVariantBest ?? 0}
								color={VARIANT_COLOR}
								loading={loading}
							/>
						</div>
						<div className="flex-1 h-full">
							{loading ? (
								<Skeleton className="h-full w-full rounded-xl" />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<LineChart
										data={timeseriesData}
										margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
									>
										<CartesianGrid
											strokeDasharray="3 3"
											className="stroke-border/50"
										/>
										<XAxis
											dataKey="date"
											tick={{ fontSize: 11 }}
											tickLine={false}
											axisLine={false}
											interval="preserveStartEnd"
										/>
										<YAxis
											tick={{ fontSize: 11 }}
											tickLine={false}
											axisLine={false}
										/>
										<Tooltip
											contentStyle={{
												backgroundColor: "hsl(var(--background))",
												border: "1px solid hsl(var(--border))",
												borderRadius: "8px",
												fontSize: 12,
											}}
										/>
										<Legend />
										<Line
											type="monotone"
											dataKey="Default"
											stroke={DEFAULT_COLOR}
											strokeWidth={2}
											dot={false}
										/>
										<Line
											type="monotone"
											dataKey="Test Variant 1"
											stroke={VARIANT_COLOR}
											strokeWidth={2}
											dot={false}
										/>
									</LineChart>
								</ResponsiveContainer>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* goals bar chart */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold">Goals</h3>
					<GoalsDropdown goals={goals} setGoals={setGoals} />
				</div>
				<Card>
					<CardContent className="p-4 h-[320px]">
						{loading ? (
							<Skeleton className="h-full w-full rounded-xl" />
						) : (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={barData}
									margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
								>
									<CartesianGrid
										strokeDasharray="3 3"
										className="stroke-border/50"
									/>
									<XAxis
										dataKey="goal"
										tick={{ fontSize: 10 }}
										tickLine={false}
										axisLine={false}
										interval={0}
										angle={-20}
										textAnchor="end"
										height={60}
									/>
									<YAxis
										tick={{ fontSize: 11 }}
										tickLine={false}
										axisLine={false}
										tickFormatter={(v) => `${v}%`}
									/>
									<Tooltip
										formatter={(value: number) => `${value}%`}
										contentStyle={{
											backgroundColor: "hsl(var(--background))",
											border: "1px solid hsl(var(--border))",
											borderRadius: "8px",
											fontSize: 12,
										}}
									/>
									<Legend />
									<Bar
										dataKey="Default"
										fill={DEFAULT_COLOR}
										radius={[4, 4, 0, 0]}
									/>
									<Bar
										dataKey="Test Variant 1"
										fill={VARIANT_COLOR}
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						)}
					</CardContent>
				</Card>
			</div>

			{/* tables */}
			<Tabs defaultValue="funnel" className="flex flex-col gap-2">
				<TabsList>
					<TabsTrigger value="funnel">Funnel</TabsTrigger>
					<TabsTrigger value="byGoal">By Goal</TabsTrigger>
				</TabsList>
				<TabsContent value="funnel">
					<div className="border border-border rounded-lg overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Goal</TableHead>
									<TableHead>
										<span className="flex items-center gap-2">
											<VariantTag variant="A" /> Default
										</span>
									</TableHead>
									<TableHead>
										<span className="flex items-center gap-2">
											<VariantTag variant="B" /> Test Variant 1
										</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{sortedGoals.map((g) => (
									<TableRow key={g.goal}>
										<TableCell>{g.goal}</TableCell>
										<TableCell>
											<ConversionCell
												count={g.default}
												total={visitors.default}
											/>
										</TableCell>
										<TableCell>
											<ConversionCell
												count={g.variant}
												total={visitors.variant}
											/>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</TabsContent>
				<TabsContent value="byGoal" className="flex flex-col gap-4">
					{sortedGoals.map((g) => (
						<div key={g.goal} className="flex flex-col gap-2">
							<p className="font-medium">{g.goal}</p>
							<div className="border border-border rounded-lg overflow-hidden">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Variant</TableHead>
											<TableHead>Visitors</TableHead>
											<TableHead>{g.goal}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<TableRow>
											<TableCell>
												<span className="flex items-center gap-2">
													<VariantTag variant="A" /> Default
												</span>
											</TableCell>
											<TableCell>{visitors.default}</TableCell>
											<TableCell>{g.default}</TableCell>
										</TableRow>
										<TableRow>
											<TableCell>
												<span className="flex items-center gap-2">
													<VariantTag variant="B" /> Test Variant 1
												</span>
											</TableCell>
											<TableCell>{visitors.variant}</TableCell>
											<TableCell>{g.variant}</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							</div>
						</div>
					))}
				</TabsContent>
			</Tabs>
		</div>
	);
}

function ProbabilityBlock({
	variant,
	label,
	probability,
	color,
	loading,
}: {
	variant: "A" | "B";
	label: string;
	probability: number;
	color: string;
	loading: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="flex items-center gap-2">
				<VariantTag variant={variant} />
				<span className="text-sm">{label}</span>
			</span>
			<Progress
				value={loading ? 0 : probability * 100}
				style={{ ["--progress-color" as string]: color } as React.CSSProperties}
			/>
			<span className="text-xs text-muted-foreground">
				Probability that this variant is the best:{" "}
				{loading ? "…" : `${(probability * 100).toFixed(1)}%`}
			</span>
		</div>
	);
}

function ConversionCell({ count, total }: { count: number; total: number }) {
	if (!count) return <span>0</span>;
	return (
		<span className="flex items-end gap-1">
			<span>{count}</span>
			{total > 0 && (
				<span className="text-xs text-muted-foreground">
					{((count / total) * 100).toFixed(2)}%
				</span>
			)}
		</span>
	);
}

function GoalsDropdown({
	goals,
	setGoals,
}: {
	goals: Goal[];
	setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
}) {
	const activeCount = goals.filter((g) => g.active).length;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					Funnel steps ({activeCount})
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-64 max-h-80 overflow-y-auto"
			>
				{goals.map((goal) => (
					<DropdownMenuCheckboxItem
						key={goal.name}
						checked={goal.active}
						onCheckedChange={() =>
							setGoals((prev) =>
								prev.map((g) =>
									g.name === goal.name ? { ...g, active: !g.active } : g,
								),
							)
						}
						onSelect={(e) => e.preventDefault()}
					>
						{goal.name}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ─── new experiment dialog ────────────────────────────────────────────────────

interface CreateResult {
	experiment: Experiment | null;
	error?: string;
}

function NewExperimentDialog({
	open,
	onOpenChange,
	callTool,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	callTool: <T>(
		name: string,
		args: Record<string, unknown>,
	) => Promise<T | null>;
	onCreated: () => void | Promise<void>;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset the form whenever the dialog opens.
	useEffect(() => {
		if (open) {
			setName("");
			setDescription("");
			setError(null);
			setSubmitting(false);
		}
	}, [open]);

	const submit = async () => {
		if (!name.trim() || submitting) return;
		setSubmitting(true);
		setError(null);
		const res = await callTool<CreateResult>("create_experiment", {
			name: name.trim(),
			description: description.trim() || undefined,
		});
		setSubmitting(false);
		if (!res || res.error || !res.experiment) {
			setError(res?.error ?? "Failed to create experiment.");
			return;
		}
		onOpenChange(false);
		await onCreated();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Create new experiment</DialogTitle>
					<DialogDescription>
						Give your A/B test a name. You can configure the traffic split in
						the editor afterwards.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="experiment-name">Name</Label>
						<Input
							id="experiment-name"
							value={name}
							maxLength={30}
							placeholder="My New Experiment"
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") submit();
							}}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="experiment-description">Description</Label>
						<Textarea
							id="experiment-description"
							value={description}
							placeholder="Experiment description here"
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button onClick={submit} disabled={!name.trim() || submitting}>
						{submitting ? "Creating…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ExperimentsPage() {
	const app = useMcpApp();
	const mcpState = useMcpState<unknown, ExperimentsToolResult>();

	const result = mcpState.status === "tool-result" ? mcpState.toolResult : null;

	const domains = result?.domains ?? [];
	const hostname = result?.hostname ?? "";

	const [selected, setSelected] = useState<Experiment | null>(null);
	const [experiments, setExperiments] = useState<Experiment[]>(
		result?.experiments ?? [],
	);
	const [newOpen, setNewOpen] = useState(false);

	const callTool = useCallback(
		async <T,>(
			name: string,
			args: Record<string, unknown>,
		): Promise<T | null> => {
			if (!app) return null;
			try {
				const res = await app.callServerTool({ name, arguments: args });
				if (res?.isError || !res?.structuredContent) return null;
				return res.structuredContent as T;
			} catch {
				return null;
			}
		},
		[app],
	);

	// Sync from the launching tool-result once it arrives.
	useEffect(() => {
		if (result?.experiments) setExperiments(result.experiments);
	}, [result]);

	const refresh = useCallback(async () => {
		const res = await callTool<ExperimentsToolResult>("list_experiments", {});
		if (res?.experiments) setExperiments(res.experiments);
	}, [callTool]);

	useEffect(() => {
		if (!app) return;
		const text = selected
			? `Viewing A/B test results for **${selected.name}**`
			: "Viewing A/B test experiments";
		app
			.updateModelContext({ content: [{ type: "text", text }] })
			.catch(() => {});
		return () => {
			app.updateModelContext({ content: [] }).catch(() => {});
		};
	}, [app, selected]);

	return (
		<div className="p-4 md:p-6 max-w-5xl mx-auto">
			<div className="flex items-center justify-between gap-2 mb-4">
				<div className="flex items-center gap-2">
					{selected && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setSelected(null)}
						>
							<ArrowLeft className="w-4 h-4" />
						</Button>
					)}
					<h1 className="text-xl font-semibold">
						{selected ? "Experiment Results" : "A/B Test Experiments"}
					</h1>
				</div>
				{!selected && (
					<Button onClick={() => setNewOpen(true)}>
						<Plus className="w-4 h-4" />
						New
					</Button>
				)}
			</div>

			{selected ? (
				<ResultsView
					experiment={selected}
					domains={domains}
					initialHostname={hostname}
					callTool={callTool}
					onBack={() => setSelected(null)}
				/>
			) : (
				<ExperimentsList
					experiments={experiments}
					onSelect={setSelected}
					sitename={result?.sitename}
					error={result?.error}
				/>
			)}

			<NewExperimentDialog
				open={newOpen}
				onOpenChange={setNewOpen}
				callTool={callTool}
				onCreated={refresh}
			/>
		</div>
	);
}
