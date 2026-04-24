import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

// ─── get_error_patterns ──────────────────────────────────────────────────────

export const getErrorPatternsTool = createTool({
	id: "get_error_patterns",
	description:
		"Fetch the most common error patterns for the configured deco.cx site from HyperDX. Returns grouped error messages with occurrence counts.",
	inputSchema: z.object({
		minutes: z
			.number()
			.optional()
			.describe("Time window in minutes to look back (default: 60)"),
		limit: z
			.number()
			.optional()
			.describe("Maximum number of patterns to return (default: 20)"),
	}),
	outputSchema: z.object({
		rows: z.array(
			z.object({
				pattern: z.string(),
				count: z.number(),
			}),
		),
	}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
	},
	execute: async ({ context }, ctx) => {
		const { apiKey, site } = getConfig(ctx);
		type Result = { rows: Array<{ pattern: string; count: number }> };
		const res = await callAdmin(
			"deco-sites/admin/loaders/hyperdx/errorPatterns.ts",
			{
				sitename: site,
				minutes: context.minutes,
				limit: context.limit,
			},
			apiKey,
		).catch(() => ({ rows: [] }));
		const data = res as Result;
		return {
			rows: (data.rows ?? []).map((r) => ({
				pattern: r.pattern,
				count: r.count,
			})),
		};
	},
});

// ─── get_errors_over_time ────────────────────────────────────────────────────

export const getErrorsOverTimeTool = createTool({
	id: "get_errors_over_time",
	description:
		"Fetch error counts over time for the configured deco.cx site from HyperDX. Returns time-bucketed error data suitable for charting.",
	inputSchema: z.object({
		minutes: z
			.number()
			.optional()
			.describe("Time window in minutes to look back (default: 60)"),
		granularity: z
			.enum([
				"30 second",
				"1 minute",
				"5 minute",
				"15 minute",
				"30 minute",
				"1 hour",
			])
			.optional()
			.describe("Time bucket granularity (default: 1 minute)"),
	}),
	outputSchema: z.object({
		categories: z.array(z.string()),
		series: z.array(
			z.object({
				label: z.string(),
				values: z.array(z.number()),
			}),
		),
	}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
	},
	execute: async ({ context }, ctx) => {
		const { apiKey, site } = getConfig(ctx);
		type Result = {
			categories: string[];
			series: Array<{ label: string; values: number[] }>;
		};
		const res = await callAdmin(
			"deco-sites/admin/loaders/hyperdx/errorsOverTime.ts",
			{
				sitename: site,
				minutes: context.minutes,
				granularity: context.granularity,
			},
			apiKey,
		).catch(() => ({ categories: [], series: [] }));
		const data = res as Result;
		return {
			categories: data.categories ?? [],
			series: (data.series ?? []).map((s) => ({
				label: s.label,
				values: s.values,
			})),
		};
	},
});

// ─── get_error_rate_series ───────────────────────────────────────────────────

export const getErrorRateSeriesTool = createTool({
	id: "get_error_rate_series",
	description:
		"Fetch error rate series data (ok/warn/error counts per time bucket) for the configured deco.cx site from HyperDX.",
	inputSchema: z.object({
		hour: z
			.number()
			.optional()
			.describe("Number of hours to look back (default: 1)"),
	}),
	outputSchema: z.object({
		aggregatedData: z.array(
			z.object({
				ts_bucket: z.number(),
				warn: z.number(),
				error: z.number(),
				ok: z.number(),
			}),
		),
	}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
	},
	execute: async ({ context }, ctx) => {
		const { apiKey, site } = getConfig(ctx);
		type Result = {
			aggregatedData: Array<{
				ts_bucket: number;
				warn: number;
				error: number;
				ok: number;
			}>;
		};
		const res = await callAdmin(
			"deco-sites/admin/loaders/hyperdx/getSeriesData.ts",
			{
				sitename: site,
				hour: context.hour,
			},
			apiKey,
		).catch(() => ({ aggregatedData: [] }));
		const data = res as Result;
		return {
			aggregatedData: (data.aggregatedData ?? []).map((d) => ({
				ts_bucket: d.ts_bucket,
				warn: d.warn,
				error: d.error,
				ok: d.ok,
			})),
		};
	},
});
