import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { Env } from "../types/env.ts";

export const MONITOR_RESOURCE_URI = "ui://mcp-app/monitor";

// ─── shared types ─────────────────────────────────────────────────────────────

export const monitorFilterSchema = z.object({
	type: z.enum(["cache_status", "status_code", "path", "country"]),
	operator: z.enum(["equals", "not_equals", "contains", "not_contains"]),
	value: z.string(),
});

export type MonitorFilter = z.infer<typeof monitorFilterSchema>;

/** Shared input schema for all data-fetch tools */
const monitorQuerySchema = z.object({
	hostname: z.string().describe("Site hostname (e.g. www.example.com)"),
	startDate: z.string().describe("Start date YYYY-MM-DD"),
	endDate: z.string().describe("End date YYYY-MM-DD"),
	granularity: z
		.enum(["hourly", "daily"])
		.optional()
		.describe("'hourly' for ≤1 day ranges, 'daily' otherwise"),
	filters: z.array(monitorFilterSchema).optional(),
});

export type MonitorQuery = z.infer<typeof monitorQuerySchema>;

// ─── output types ─────────────────────────────────────────────────────────────

export const summaryOutputSchema = z.object({
	total_requests: z.number(),
	total_bandwidth_bytes: z.number(),
	cache_hit_ratio: z.number(),
	avg_latency_ms: z.number(),
	status_2xx_count: z.number(),
	status_4xx_count: z.number(),
	status_5xx_count: z.number(),
	unique_countries: z.number(),
});
export type SummaryData = z.infer<typeof summaryOutputSchema>;

export const timelinePointSchema = z.object({
	timestamp: z.string(),
	total_requests: z.number(),
	total_bandwidth_bytes: z.number(),
	cache_hit_ratio: z.number(),
});
export type TimelineDataPoint = z.infer<typeof timelinePointSchema>;

export const pathDataSchema = z.object({
	url: z.string(),
	total_requests: z.number(),
	total_bandwidth_bytes: z.number(),
	percentage: z.number(),
});
export type PathData = z.infer<typeof pathDataSchema>;

export const countryDataSchema = z.object({
	country: z.string(),
	total_requests: z.number(),
	total_bandwidth_bytes: z.number(),
	percentage: z.number(),
});
export type CountryData = z.infer<typeof countryDataSchema>;

export const cacheStatusDataSchema = z.object({
	cache_status: z.string(),
	total_requests: z.number(),
	total_bandwidth_bytes: z.number(),
	percentage: z.number(),
});
export type CacheStatusData = z.infer<typeof cacheStatusDataSchema>;

export const statusCodeDataSchema = z.object({
	status_code: z.number(),
	total_requests: z.number(),
	total_bandwidth_bytes: z.number(),
	percentage: z.number(),
});
export type StatusCodeData = z.infer<typeof statusCodeDataSchema>;

// ─── helper ───────────────────────────────────────────────────────────────────

async function invoke<T>(
	loader: string,
	props: Record<string, unknown>,
	apiKey: string,
): Promise<T> {
	return (await callAdmin(loader, props, apiKey)) as T;
}

function extractHostname(raw: string): string {
	return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// ─── 1. Entry-point tool ──────────────────────────────────────────────────────

export const getMonitorDataTool = (env: Env) =>
	createTool({
		id: "get_monitor_data",
		description:
			"Open the performance monitoring dashboard for the configured deco.cx site. Resolves the site's primary production hostname and launches the interactive monitor UI.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			sitename: z.string(),
			hostname: z.string(),
		}),
		_meta: { ui: { resourceUri: MONITOR_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async () => {
			const { apiKey, site } = getConfig(env);

			type DomainEntry = { domain: string; production?: boolean };
			const domains = await invoke<DomainEntry[]>(
				"deco-sites/admin/loaders/sites/domains.ts",
				{ sitename: site },
				apiKey,
			).catch(() => [] as DomainEntry[]);

			const hostname = domains[0]?.domain
				? extractHostname(domains[0].domain)
				: "";

			return { sitename: site, hostname };
		},
	});

// ─── 2. Summary ───────────────────────────────────────────────────────────────

export const getMonitorSummaryTool = (env: Env) =>
	createTool({
		id: "get_monitor_summary",
		description:
			"Fetch aggregate summary stats for a site: total requests, bandwidth, cache hit ratio, average latency, and status code counts.",
		inputSchema: monitorQuerySchema,
		outputSchema: summaryOutputSchema.nullable(),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			type Result = { data: SummaryData | null };
			const res = await invoke<Result>(
				"deco-sites/admin/loaders/monitor/summary.ts",
				{ sitename: site, ...context, filters: context.filters ?? [] },
				apiKey,
			).catch(() => ({ data: null }));
			return res.data;
		},
	});

// ─── 3. Timeline ──────────────────────────────────────────────────────────────

export const getMonitorTimelineTool = (env: Env) =>
	createTool({
		id: "get_monitor_timeline",
		description:
			"Fetch the requests & bandwidth usage timeline for a site over a date range.",
		inputSchema: monitorQuerySchema,
		outputSchema: z.object({ data: z.array(timelinePointSchema) }),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			type Result = { data: TimelineDataPoint[] };
			const res = await invoke<Result>(
				"deco-sites/admin/loaders/monitor/usageTimeline.ts",
				{ sitename: site, ...context, filters: context.filters ?? [] },
				apiKey,
			).catch(() => ({ data: [] }));
			return { data: res.data ?? [] };
		},
	});

// ─── 4. Top Paths ─────────────────────────────────────────────────────────────

export const getMonitorTopPathsTool = (env: Env) =>
	createTool({
		id: "get_monitor_top_paths",
		description: "Fetch the top requested URLs for a site.",
		inputSchema: monitorQuerySchema.extend({
			groupByPath: z
				.boolean()
				.optional()
				.describe("When true, ignores query strings"),
			metric: z
				.enum(["requests", "bandwidth"])
				.optional()
				.describe("Order by requests or bandwidth"),
			limit: z.number().optional(),
		}),
		outputSchema: z.object({ data: z.array(pathDataSchema) }),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			const {
				groupByPath = true,
				metric = "requests",
				limit = 20,
				...query
			} = context;
			type Result = { data: PathData[] };
			const res = await invoke<Result>(
				"deco-sites/admin/loaders/monitor/topPaths.ts",
				{
					sitename: site,
					...query,
					filters: query.filters ?? [],
					groupByPath,
					orderBy: metric,
					limit,
				},
				apiKey,
			).catch(() => ({ data: [] }));
			return { data: res.data ?? [] };
		},
	});

// ─── 5. Top Countries ────────────────────────────────────────────────────────

export const getMonitorTopCountriesTool = (env: Env) =>
	createTool({
		id: "get_monitor_top_countries",
		description: "Fetch the geographic distribution of traffic for a site.",
		inputSchema: monitorQuerySchema.extend({
			limit: z.number().optional(),
		}),
		outputSchema: z.object({
			data: z.array(countryDataSchema),
			total_requests: z.number(),
		}),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			const { limit = 20, ...query } = context;
			type Result = { data: CountryData[]; total_requests: number };
			const res = await invoke<Result>(
				"deco-sites/admin/loaders/monitor/topCountries.ts",
				{ sitename: site, ...query, filters: query.filters ?? [], limit },
				apiKey,
			).catch(() => ({ data: [], total_requests: 0 }));
			return { data: res.data ?? [], total_requests: res.total_requests ?? 0 };
		},
	});

// ─── 6. Cache Status ─────────────────────────────────────────────────────────

export const getMonitorCacheStatusTool = (env: Env) =>
	createTool({
		id: "get_monitor_cache_status",
		description:
			"Fetch the cache status distribution (hit/miss/bypass/…) for a site.",
		inputSchema: monitorQuerySchema,
		outputSchema: z.object({ data: z.array(cacheStatusDataSchema) }),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			type Result = { data: CacheStatusData[] };
			const res = await invoke<Result>(
				"deco-sites/admin/loaders/monitor/cacheStatus.ts",
				{ sitename: site, ...context, filters: context.filters ?? [] },
				apiKey,
			).catch(() => ({ data: [] }));
			return { data: res.data ?? [] };
		},
	});

// ─── 7. Status Codes ─────────────────────────────────────────────────────────

export const getMonitorStatusCodesTool = (env: Env) =>
	createTool({
		id: "get_monitor_status_codes",
		description: "Fetch the HTTP response status code distribution for a site.",
		inputSchema: monitorQuerySchema,
		outputSchema: z.object({ data: z.array(statusCodeDataSchema) }),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			type Result = { data: StatusCodeData[] };
			const res = await invoke<Result>(
				"deco-sites/admin/loaders/monitor/statusCodes.ts",
				{ sitename: site, ...context, filters: context.filters ?? [] },
				apiKey,
			).catch(() => ({ data: [] }));
			return { data: res.data ?? [] };
		},
	});

// ─── 8. Analytics proxy ───────────────────────────────────────────────────────

export const getAnalyticsDataTool = (env: Env) =>
	createTool({
		id: "get_analytics_data",
		description:
			"Proxy analytics requests to the OneDollarStats backend for a site. Used by the Analytics tab of the monitor UI.",
		inputSchema: z.object({
			hostname: z.string().describe("Site hostname"),
			body: z.unknown().describe("Request body forwarded to the analytics API"),
		}),
		// Wrap in a concrete object so the runtime always serialises it into structuredContent
		outputSchema: z.object({ data: z.unknown() }),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			console.log("get_analytics_data");
			const { apiKey, site } = getConfig(env);
			const data = await invoke<unknown>(
				"deco-sites/admin/loaders/onedollarstats/proxy.ts",
				{
					body: {
						body: context.body,
					},
					hostname: context.hostname,
					sitename: site,
				},
				apiKey,
			).catch(() => null);
			return { data };
		},
	});
