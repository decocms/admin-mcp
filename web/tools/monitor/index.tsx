import {
	AlertTriangle,
	BarChart2,
	Clock,
	Filter,
	Globe,
	Layers,
	RefreshCw,
	ShieldCheck,
	TrendingUp,
	X,
	Zap,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	CacheStatusData,
	CountryData,
	MonitorFilter,
	PathData,
	StatusCodeData,
	SummaryData,
	TimelineDataPoint,
} from "../../../api/tools/monitor.ts";

// ─── global type augmentation ─────────────────────────────────────────────────

declare global {
	interface Window {
		// biome-ignore lint/suspicious/noExplicitAny: analytics bridge
		fetchAnalytics: (body: any) => Promise<any>;
	}
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatNumber(v: number | string): string {
	const n = Number(v);
	if (Number.isNaN(n)) return String(v);
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(Math.round(n));
}

function formatBytes(v: number | string): string {
	const n = Number(v);
	if (Number.isNaN(n)) return String(v);
	if (n >= 1_099_511_627_776) return `${(n / 1_099_511_627_776).toFixed(1)} TB`;
	if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
	if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
	if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
	return `${n} B`;
}

type TimeRange = "today" | "7d" | "14d" | "30d" | "90d";
type MetricType = "requests" | "bandwidth";
type FilterType = "cache_status" | "status_code" | "path" | "country";
type FilterOperator = "equals" | "not_equals" | "contains" | "not_contains";

function getDateRange(range: TimeRange): {
	startDate: string;
	endDate: string;
} {
	const end = new Date();
	const start = new Date();
	switch (range) {
		case "today":
			start.setDate(end.getDate() - 1);
			break;
		case "7d":
			start.setDate(end.getDate() - 7);
			break;
		case "14d":
			start.setDate(end.getDate() - 14);
			break;
		case "30d":
			start.setDate(end.getDate() - 30);
			break;
		case "90d":
			start.setDate(end.getDate() - 90);
			break;
	}
	return {
		startDate: start.toISOString().split("T")[0],
		endDate: end.toISOString().split("T")[0],
	};
}

function getGranularity(range: TimeRange): "hourly" | "daily" {
	return range === "today" ? "hourly" : "daily";
}

const TIME_RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
	{ label: "Last 24h", value: "today" },
	{ label: "Last 7 days", value: "7d" },
	{ label: "Last 14 days", value: "14d" },
	{ label: "Last 30 days", value: "30d" },
	{ label: "Last 90 days", value: "90d" },
];

const FILTER_TYPE_OPTIONS: { label: string; value: FilterType }[] = [
	{ label: "Cache status", value: "cache_status" },
	{ label: "Status code", value: "status_code" },
	{ label: "Path", value: "path" },
	{ label: "Country", value: "country" },
];

const CACHE_STATUS_VALUES = [
	"hit",
	"miss",
	"expired",
	"stale",
	"dynamic",
	"bypass",
];

const STATUS_CODE_VALUES = [
	"200",
	"201",
	"204",
	"301",
	"302",
	"304",
	"400",
	"401",
	"403",
	"404",
	"500",
	"502",
	"503",
	"504",
];

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({
	title,
	value,
	icon,
	loading,
}: {
	title: string;
	value: string;
	icon: React.ReactNode;
	loading?: boolean;
}) {
	if (loading) {
		return (
			<Card>
				<CardContent className="p-4">
					<div className="flex items-center justify-between mb-2">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-8 w-8 rounded-lg" />
					</div>
					<Skeleton className="h-7 w-20 mt-1" />
				</CardContent>
			</Card>
		);
	}
	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center justify-between mb-1.5">
					<p className="text-xs text-muted-foreground">{title}</p>
					<div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
						{icon}
					</div>
				</div>
				<p className="text-2xl font-bold">{value}</p>
			</CardContent>
		</Card>
	);
}

// ─── chart ────────────────────────────────────────────────────────────────────

function UsageChart({
	data,
	loading,
	granularity,
}: {
	data: TimelineDataPoint[];
	loading: boolean;
	granularity: "hourly" | "daily";
}) {
	const [hidden, setHidden] = useState<Set<string>>(new Set());

	const toggle = useCallback(
		(key: string) =>
			setHidden((prev) => {
				const next = new Set(prev);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			}),
		[],
	);

	if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;

	if (!data.length) {
		return (
			<div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
				No data available for the selected period.
			</div>
		);
	}

	const chartData = data.map((d) => ({
		label:
			granularity === "hourly"
				? new Date(d.timestamp).toLocaleString("en-US", {
						month: "short",
						day: "numeric",
						hour: "2-digit",
					})
				: new Date(d.timestamp).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
					}),
		requests: d.total_requests,
		bandwidth: d.total_bandwidth_bytes,
	}));

	const series = [
		{ key: "requests", label: "Requests", color: "#3B82F6" },
		{ key: "bandwidth", label: "Bandwidth", color: "#F97316" },
	];

	return (
		<div className="flex flex-col gap-3">
			<ResponsiveContainer width="100%" height={260}>
				<AreaChart
					data={chartData}
					margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
				>
					<CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
					<XAxis
						dataKey="label"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						interval="preserveStartEnd"
					/>
					<YAxis
						yAxisId="requests"
						orientation="left"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						tickFormatter={formatNumber}
					/>
					<YAxis
						yAxisId="bandwidth"
						orientation="right"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						tickFormatter={formatBytes}
					/>
					<Tooltip
						formatter={(value: number, name: string) =>
							name === "bandwidth"
								? [formatBytes(value), "Bandwidth"]
								: [formatNumber(value), "Requests"]
						}
						contentStyle={{
							backgroundColor: "hsl(var(--background))",
							border: "1px solid hsl(var(--border))",
							borderRadius: "8px",
							fontSize: 12,
						}}
					/>
					{series.map((s) =>
						hidden.has(s.key) ? null : (
							<Area
								key={s.key}
								yAxisId={s.key}
								type="monotone"
								dataKey={s.key}
								stroke={s.color}
								fill={`${s.color}22`}
								strokeWidth={2}
								dot={false}
								activeDot={{ r: 4 }}
							/>
						),
					)}
				</AreaChart>
			</ResponsiveContainer>

			<div className="flex justify-center gap-6">
				{series.map((s) => (
					<button
						key={s.key}
						type="button"
						onClick={() => toggle(s.key)}
						className={cn(
							"flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 select-none",
							hidden.has(s.key) ? "opacity-40" : "opacity-100",
						)}
					>
						<span
							className="inline-block w-2 h-2 rounded-full"
							style={{ background: s.color }}
						/>
						<span className="text-muted-foreground">{s.label}</span>
					</button>
				))}
			</div>
		</div>
	);
}

// ─── distribution table ───────────────────────────────────────────────────────

function DistributionTable({
	rows,
	metric,
	loading,
	onFilter,
	onExclude,
}: {
	rows: {
		label: string;
		requests: number;
		bandwidth: number;
		percentage: number;
	}[];
	metric: MetricType;
	loading: boolean;
	onFilter?: (label: string) => void;
	onExclude?: (label: string) => void;
}) {
	if (loading) {
		return (
			<div className="flex flex-col gap-2">
				{["sk1", "sk2", "sk3", "sk4", "sk5"].map((key) => (
					<Skeleton key={key} className="h-8 w-full rounded" />
				))}
			</div>
		);
	}

	if (!rows.length) {
		return (
			<p className="text-sm text-muted-foreground text-center py-4">
				No data available
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			{rows.map((row) => {
				const value = metric === "bandwidth" ? row.bandwidth : row.requests;
				const formatted =
					metric === "bandwidth" ? formatBytes(value) : formatNumber(value);
				return (
					<div
						key={row.label}
						className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
					>
						<div className="flex-1 min-w-0">
							<div className="flex items-center justify-between mb-0.5">
								<span className="text-xs font-mono truncate" title={row.label}>
									{row.label}
								</span>
								<span className="text-xs text-muted-foreground ml-2 shrink-0">
									{formatted}
								</span>
							</div>
							<div className="h-1.5 rounded-full bg-muted overflow-hidden">
								<div
									className="h-full rounded-full bg-primary/60"
									style={{ width: `${Math.min(row.percentage, 100)}%` }}
								/>
							</div>
						</div>
						<span className="text-xs text-muted-foreground w-10 text-right shrink-0">
							{row.percentage.toFixed(1)}%
						</span>
						{(onFilter || onExclude) && (
							<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
								{onFilter && (
									<button
										type="button"
										onClick={() => onFilter(row.label)}
										className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
										title="Filter"
									>
										=
									</button>
								)}
								{onExclude && (
									<button
										type="button"
										onClick={() => onExclude(row.label)}
										className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20"
										title="Exclude"
									>
										≠
									</button>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ─── filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
	filters,
	onAdd,
	onRemove,
	onClear,
}: {
	filters: MonitorFilter[];
	onAdd: (f: MonitorFilter) => void;
	onRemove: (idx: number) => void;
	onClear: () => void;
}) {
	const [adding, setAdding] = useState(false);
	const [type, setType] = useState<FilterType>("cache_status");
	const [operator, setOperator] = useState<FilterOperator>("equals");
	const [value, setValue] = useState("");

	const handleApply = () => {
		if (!value.trim()) return;
		onAdd({ type, operator, value: value.trim() });
		setAdding(false);
		setValue("");
		setType("cache_status");
		setOperator("equals");
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			{filters.map((f, idx) => (
				<div
					key={`${f.type}-${f.operator}-${f.value}`}
					className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-muted/30 text-xs"
				>
					<span className="text-muted-foreground">
						{FILTER_TYPE_OPTIONS.find((o) => o.value === f.type)?.label}
					</span>
					<span>{f.operator.replace("_", " ")}</span>
					<span className="font-medium">{f.value}</span>
					<button
						type="button"
						onClick={() => onRemove(idx)}
						className="ml-0.5 p-0.5 rounded hover:bg-accent"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			))}

			{adding ? (
				<div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background shadow-sm">
					<Select value={type} onValueChange={(v) => setType(v as FilterType)}>
						<SelectTrigger className="h-7 text-xs w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{FILTER_TYPE_OPTIONS.map((o) => (
								<SelectItem key={o.value} value={o.value} className="text-xs">
									{o.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select
						value={operator}
						onValueChange={(v) => setOperator(v as FilterOperator)}
					>
						<SelectTrigger className="h-7 text-xs w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="equals" className="text-xs">
								equals
							</SelectItem>
							<SelectItem value="not_equals" className="text-xs">
								not equals
							</SelectItem>
							{type === "path" && (
								<>
									<SelectItem value="contains" className="text-xs">
										contains
									</SelectItem>
									<SelectItem value="not_contains" className="text-xs">
										not contains
									</SelectItem>
								</>
							)}
						</SelectContent>
					</Select>

					{type === "cache_status" ? (
						<Select value={value} onValueChange={setValue}>
							<SelectTrigger className="h-7 text-xs w-28">
								<SelectValue placeholder="Select…" />
							</SelectTrigger>
							<SelectContent>
								{CACHE_STATUS_VALUES.map((v) => (
									<SelectItem key={v} value={v} className="text-xs">
										{v}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : type === "status_code" ? (
						<Select value={value} onValueChange={setValue}>
							<SelectTrigger className="h-7 text-xs w-28">
								<SelectValue placeholder="Select…" />
							</SelectTrigger>
							<SelectContent>
								{STATUS_CODE_VALUES.map((v) => (
									<SelectItem key={v} value={v} className="text-xs">
										{v}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<input
							type="text"
							placeholder="e.g. /api/*"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleApply()}
							className="h-7 px-2 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary w-28"
						/>
					)}

					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs px-2"
						onClick={() => {
							setAdding(false);
							setValue("");
						}}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						className="h-7 text-xs px-2"
						onClick={handleApply}
						disabled={!value.trim()}
					>
						Apply
					</Button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setAdding(true)}
					className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-border hover:border-primary hover:bg-accent transition-colors text-xs text-muted-foreground"
				>
					<Filter className="w-3 h-3" />
					Add filter
				</button>
			)}

			{filters.length > 0 && (
				<button
					type="button"
					onClick={onClear}
					className="text-xs text-muted-foreground hover:text-foreground px-1"
				>
					Clear all
				</button>
			)}
		</div>
	);
}

// ─── analytics tab ────────────────────────────────────────────────────────────

const ADMIN_BASE_URL =
	(typeof window !== "undefined" &&
		(window as Window & { __ADMIN_BASE_URL__?: string }).__ADMIN_BASE_URL__) ||
	"https://admin.deco.cx";

function loadScript(src: string) {
	if (typeof document === "undefined") return;
	if (document.querySelector(`script[src="${src}"]`)) return;
	const s = document.createElement("script");
	s.src = src;
	s.defer = true;
	document.head.appendChild(s);
}

function AnalyticsTab({ hostname }: { hostname: string }) {
	// Always access the latest app without capturing a stale closure
	const app = useMcpApp();
	const appRef = useRef(app);
	appRef.current = app;

	const hostnameRef = useRef(hostname);
	hostnameRef.current = hostname;

	const scriptsLoaded = useRef(false);

	useEffect(() => {
		// Set up the bridge that the stonks web component calls for all analytics requests.
		// Using refs means the closure never goes stale even if app/hostname change.
		window.fetchAnalytics = async (body) => {
			const currentApp = appRef.current;

			if (!currentApp) return null;
			try {
				const result = await currentApp.callServerTool({
					name: "get_analytics_data",
					arguments: { body: body.body, hostname: hostnameRef.current },
				});

				if (result == null || result.isError) return null;
				// Tool wraps the response in { data } so the runtime always populates structuredContent
				if (result.structuredContent != null) {
					return (result.structuredContent as { data: unknown }).data ?? null;
				}
				// Fallback: runtime serialised to content[0].text as JSON string
				const first = result.content?.[0];
				const text = first && "text" in first ? first.text : null;
				if (!text) return null;
				try {
					const parsed = JSON.parse(text) as { data?: unknown };
					return parsed?.data ?? parsed;
				} catch {
					return null;
				}
			} catch {
				return null;
			}
		};

		// Load scripts only after the bridge is registered so the web component
		// can call fetchAnalytics as soon as it initialises.
		if (!scriptsLoaded.current) {
			scriptsLoaded.current = true;
			loadScript(`${ADMIN_BASE_URL}/onedollarstats/stonks-dashboard.js?v=1`);
			loadScript(`${ADMIN_BASE_URL}/onedollarstats/stonks-insights.js?v=1`);
		}
	}, []);

	if (!hostname) return null;

	return <StonksDashboardElement website={hostname} />;
}

// React sets props AFTER inserting custom elements into the DOM, so Svelte's
// connectedCallback fires with getAttribute('website') === null → crash.
// Creating the element imperatively and setting the attribute first mirrors
// what Preact does and guarantees connectedCallback sees the correct value.
function StonksDashboardElement({ website }: { website: string }) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const el = document.createElement("stonks-dashboard");
		el.setAttribute("website", website);
		container.appendChild(el);
		return () => el.remove();
	}, [website]);

	useEffect(() => {
		const el = containerRef.current?.querySelector("stonks-dashboard");
		if (el) el.setAttribute("website", website);
	}, [website]);

	return <div ref={containerRef} className="w-full" />;
}

// ─── main page ────────────────────────────────────────────────────────────────

type LoadState<T> = { data: T | null; loading: boolean };

function idle<T>(): LoadState<T> {
	return { data: null, loading: true };
}

export default function MonitorPage() {
	const app = useMcpApp();
	const mcpState = useMcpState<
		unknown,
		{ sitename: string; hostname: string }
	>();

	const initialResult =
		mcpState.status === "tool-result" ? mcpState.toolResult : null;

	const hostname = initialResult?.hostname ?? "";

	// ── per-section state ──────────────────────────────────────────────────────
	const [summary, setSummary] = useState<LoadState<SummaryData>>(idle());
	const [timeline, setTimeline] = useState<LoadState<TimelineDataPoint[]>>(
		idle(),
	);
	const [paths, setPaths] = useState<LoadState<PathData[]>>(idle());
	const [countries, setCountries] = useState<
		LoadState<{ data: CountryData[]; total_requests: number }>
	>(idle());
	const [cacheStatus, setCacheStatus] = useState<LoadState<CacheStatusData[]>>(
		idle(),
	);
	const [statusCodes, setStatusCodes] = useState<LoadState<StatusCodeData[]>>(
		idle(),
	);

	// ── ui state ───────────────────────────────────────────────────────────────
	const [timeRange, setTimeRange] = useState<TimeRange>("30d");
	const [metric, setMetric] = useState<MetricType>("requests");
	const [filters, setFilters] = useState<MonitorFilter[]>([]);
	const [groupByPath, setGroupByPath] = useState(true);

	// ── helpers ────────────────────────────────────────────────────────────────

	const callTool = useCallback(
		async <T,>(
			name: string,
			args: Record<string, unknown>,
		): Promise<T | null> => {
			if (!app) return null;
			try {
				const result = await app.callServerTool({ name, arguments: args });
				if (result?.isError || !result?.structuredContent) return null;
				return result.structuredContent as T;
			} catch {
				return null;
			}
		},
		[app],
	);

	const buildQueryArgs = useCallback(
		(
			range: TimeRange,
			activeFilters: MonitorFilter[],
		): Record<string, unknown> => {
			const { startDate, endDate } = getDateRange(range);
			return {
				hostname,
				startDate,
				endDate,
				granularity: getGranularity(range),
				filters: activeFilters,
			};
		},
		[hostname],
	);

	// ── data fetching ──────────────────────────────────────────────────────────

	const fetchAll = useCallback(
		async (
			range: TimeRange,
			activeFilters: MonitorFilter[],
			activeGroupByPath: boolean,
			activeMetric: MetricType,
		) => {
			if (!hostname) return;
			const q = buildQueryArgs(range, activeFilters);

			setSummary(idle());
			setTimeline(idle());
			setPaths(idle());
			setCountries(idle());
			setCacheStatus(idle());
			setStatusCodes(idle());

			await Promise.all([
				callTool<SummaryData>("get_monitor_summary", q).then((d) =>
					setSummary({ data: d, loading: false }),
				),
				callTool<{ data: TimelineDataPoint[] }>("get_monitor_timeline", q).then(
					(d) => setTimeline({ data: d?.data ?? [], loading: false }),
				),
				callTool<{ data: PathData[] }>("get_monitor_top_paths", {
					...q,
					groupByPath: activeGroupByPath,
					metric: activeMetric,
					limit: 20,
				}).then((d) => setPaths({ data: d?.data ?? [], loading: false })),
				callTool<{ data: CountryData[]; total_requests: number }>(
					"get_monitor_top_countries",
					{ ...q, limit: 20 },
				).then((d) =>
					setCountries({
						data: d ?? { data: [], total_requests: 0 },
						loading: false,
					}),
				),
				callTool<{ data: CacheStatusData[] }>(
					"get_monitor_cache_status",
					q,
				).then((d) => setCacheStatus({ data: d?.data ?? [], loading: false })),
				callTool<{ data: StatusCodeData[] }>(
					"get_monitor_status_codes",
					q,
				).then((d) => setStatusCodes({ data: d?.data ?? [], loading: false })),
			]);
		},
		[hostname, buildQueryArgs, callTool],
	);

	const fetchPaths = useCallback(
		async (
			range: TimeRange,
			activeFilters: MonitorFilter[],
			activeGroupByPath: boolean,
			activeMetric: MetricType,
		) => {
			if (!hostname) return;
			const q = buildQueryArgs(range, activeFilters);
			setPaths(idle());
			const d = await callTool<{ data: PathData[] }>("get_monitor_top_paths", {
				...q,
				groupByPath: activeGroupByPath,
				metric: activeMetric,
				limit: 20,
			});
			setPaths({ data: d?.data ?? [], loading: false });
		},
		[hostname, buildQueryArgs, callTool],
	);

	const didFetch = useRef(false);
	useEffect(() => {
		if (hostname && !didFetch.current) {
			didFetch.current = true;
			fetchAll(timeRange, filters, groupByPath, metric);
		}
	}, [hostname, fetchAll, timeRange, filters, groupByPath, metric]);

	// ── event handlers ─────────────────────────────────────────────────────────

	const handleTimeRange = (v: TimeRange) => {
		setTimeRange(v);
		fetchAll(v, filters, groupByPath, metric);
	};

	const handleMetric = (v: MetricType) => {
		setMetric(v);
		fetchPaths(timeRange, filters, groupByPath, v);
	};

	const handleGroupByPath = (v: boolean) => {
		setGroupByPath(v);
		fetchPaths(timeRange, filters, v, metric);
	};

	const addFilter = (f: MonitorFilter) => {
		const next = [...filters, f];
		setFilters(next);
		fetchAll(timeRange, next, groupByPath, metric);
	};

	const removeFilter = (idx: number) => {
		const next = filters.filter((_, i) => i !== idx);
		setFilters(next);
		fetchAll(timeRange, next, groupByPath, metric);
	};

	const clearFilters = () => {
		setFilters([]);
		fetchAll(timeRange, [], groupByPath, metric);
	};

	const addFilterFromTable = (
		type: FilterType,
		value: string,
		operator: FilterOperator = "equals",
	) => addFilter({ type, operator, value });

	// ── derived ────────────────────────────────────────────────────────────────

	const granularity = getGranularity(timeRange);
	const s = summary.data;

	const statCards = [
		{
			title: "Total Requests",
			value: s ? formatNumber(s.total_requests) : "—",
			icon: <BarChart2 className="w-4 h-4" />,
		},
		{
			title: "Bandwidth",
			value: s ? formatBytes(s.total_bandwidth_bytes) : "—",
			icon: <Layers className="w-4 h-4" />,
		},
		{
			title: "Cache Hit Rate",
			value: s ? `${(s.cache_hit_ratio ?? 0).toFixed(1)}%` : "—",
			icon: <ShieldCheck className="w-4 h-4" />,
		},
		{
			title: "Avg Latency",
			value:
				s && s.avg_latency_ms > 0 ? `${Math.round(s.avg_latency_ms)}ms` : "—",
			icon: <Clock className="w-4 h-4" />,
		},
		{
			title: "5xx Errors",
			value: s ? formatNumber(s.status_5xx_count) : "—",
			icon: <AlertTriangle className="w-4 h-4" />,
		},
		{
			title: "4xx Errors",
			value: s ? formatNumber(s.status_4xx_count) : "—",
			icon: <AlertTriangle className="w-4 h-4" />,
		},
		{
			title: "Countries",
			value: s ? formatNumber(s.unique_countries) : "—",
			icon: <Globe className="w-4 h-4" />,
		},
		{
			title: "2xx Responses",
			value: s ? formatNumber(s.status_2xx_count) : "—",
			icon: <Zap className="w-4 h-4" />,
		},
	];

	const cacheRows = (cacheStatus.data ?? []).map((d) => ({
		label: d.cache_status,
		requests: d.total_requests,
		bandwidth: d.total_bandwidth_bytes,
		percentage: d.percentage,
	}));

	const statusRows = (statusCodes.data ?? []).map((d) => ({
		label: String(d.status_code),
		requests: d.total_requests,
		bandwidth: d.total_bandwidth_bytes,
		percentage: d.percentage,
	}));

	const pathRows = (paths.data ?? []).map((d) => ({
		label: d.url,
		requests: d.total_requests,
		bandwidth: d.total_bandwidth_bytes,
		percentage: d.percentage,
	}));

	const countryRows = (countries.data?.data ?? []).map((d) => ({
		label: d.country,
		requests: d.total_requests,
		bandwidth: d.total_bandwidth_bytes,
		percentage: d.percentage,
	}));

	// ── render ─────────────────────────────────────────────────────────────────

	if (!hostname) {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<p className="text-sm font-medium">No domain configured</p>
					<p className="text-xs text-muted-foreground">
						Add and validate a domain in your site settings to view monitoring
						data.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col gap-4 pb-8 p-4">
			{/* Header */}
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-bold">Monitor</h1>
				<p className="text-xs text-muted-foreground font-mono">{hostname}</p>
			</div>

			<Tabs defaultValue="performance">
				<TabsList className="mb-4">
					<TabsTrigger value="performance">
						<TrendingUp className="w-3.5 h-3.5 mr-1.5" />
						Performance
					</TabsTrigger>
					<TabsTrigger value="analytics">
						<BarChart2 className="w-3.5 h-3.5 mr-1.5" />
						Analytics
					</TabsTrigger>
				</TabsList>

				{/* ── Performance tab ── */}
				<TabsContent value="performance" className="flex flex-col gap-4">
					{/* Toolbar */}
					<div className="flex flex-wrap items-center justify-between gap-3">
						<FilterBar
							filters={filters}
							onAdd={addFilter}
							onRemove={removeFilter}
							onClear={clearFilters}
						/>
						<div className="flex items-center gap-2 shrink-0">
							<Select
								value={timeRange}
								onValueChange={(v) => handleTimeRange(v as TimeRange)}
							>
								<SelectTrigger className="h-8 text-xs w-36">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TIME_RANGE_OPTIONS.map((o) => (
										<SelectItem
											key={o.value}
											value={o.value}
											className="text-xs"
										>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								size="icon"
								className="h-8 w-8"
								onClick={() =>
									fetchAll(timeRange, filters, groupByPath, metric)
								}
								title="Refresh"
							>
								<RefreshCw
									className={cn(
										"w-3.5 h-3.5",
										summary.loading && "animate-spin",
									)}
								/>
							</Button>
						</div>
					</div>

					{/* Stat cards */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						{statCards.map((c) => (
							<StatCard key={c.title} {...c} loading={summary.loading} />
						))}
					</div>

					{/* Timeline chart */}
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">
								Usage Over Time
							</CardTitle>
							<p className="text-xs text-muted-foreground">
								Requests (left axis) · Bandwidth (right axis)
							</p>
						</CardHeader>
						<CardContent>
							<UsageChart
								data={timeline.data ?? []}
								loading={timeline.loading}
								granularity={granularity}
							/>
						</CardContent>
					</Card>

					{/* Metric toggle */}
					<div className="flex items-center gap-1 rounded-lg border border-border w-fit overflow-hidden text-sm">
						{(["requests", "bandwidth"] as MetricType[]).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => handleMetric(m)}
								className={cn(
									"px-4 py-1.5 font-medium capitalize transition-colors",
									metric === m
										? "bg-primary text-primary-foreground"
										: "hover:bg-accent text-muted-foreground",
								)}
							>
								{m}
							</button>
						))}
					</div>

					{/* Cache + Status codes */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium">
									Cache Status
								</CardTitle>
								<p className="text-xs text-muted-foreground">
									Distribution of cache responses
								</p>
							</CardHeader>
							<CardContent>
								<DistributionTable
									rows={cacheRows}
									metric={metric}
									loading={cacheStatus.loading}
									onFilter={(l) => addFilterFromTable("cache_status", l)}
									onExclude={(l) =>
										addFilterFromTable("cache_status", l, "not_equals")
									}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium">
									Status Codes
								</CardTitle>
								<p className="text-xs text-muted-foreground">
									HTTP response status distribution
								</p>
							</CardHeader>
							<CardContent>
								<DistributionTable
									rows={statusRows}
									metric={metric}
									loading={statusCodes.loading}
									onFilter={(l) => addFilterFromTable("status_code", l)}
									onExclude={(l) =>
										addFilterFromTable("status_code", l, "not_equals")
									}
								/>
							</CardContent>
						</Card>
					</div>

					{/* Top URLs + Top Countries */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-sm font-medium">
											Top URLs
										</CardTitle>
										<p className="text-xs text-muted-foreground">
											Most requested URLs and their performance
										</p>
									</div>
									<label className="flex items-center gap-2 cursor-pointer">
										<span className="text-xs text-muted-foreground">
											Ignore query string
										</span>
										<button
											type="button"
											role="switch"
											aria-checked={groupByPath}
											onClick={() => handleGroupByPath(!groupByPath)}
											className={cn(
												"relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
												groupByPath ? "bg-primary" : "bg-muted",
											)}
										>
											<span
												className={cn(
													"inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
													groupByPath
														? "translate-x-[18px]"
														: "translate-x-0.5",
												)}
											/>
										</button>
									</label>
								</div>
							</CardHeader>
							<CardContent>
								<DistributionTable
									rows={pathRows}
									metric={metric}
									loading={paths.loading}
									onFilter={(l) => addFilterFromTable("path", l)}
									onExclude={(l) => addFilterFromTable("path", l, "not_equals")}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium">
									Top Countries
								</CardTitle>
								<p className="text-xs text-muted-foreground">
									Geographic distribution of your traffic
								</p>
							</CardHeader>
							<CardContent>
								<DistributionTable
									rows={countryRows}
									metric={metric}
									loading={countries.loading}
									onFilter={(l) => addFilterFromTable("country", l)}
									onExclude={(l) =>
										addFilterFromTable("country", l, "not_equals")
									}
								/>
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				{/* ── Analytics tab ── */}
				<TabsContent value="analytics">
					<AnalyticsTab hostname={hostname} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
