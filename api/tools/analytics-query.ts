import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";
import type { Env } from "../types/env.ts";

const ANALYTICS_QUERY_LOADER = "deco-sites/admin/loaders/analytics/query.ts";

// Mirrors QueryOptionsObject from admin/clients/plausible.v2.ts (AI-friendly object shape)
const dateRangePreset = z.enum([
	"day",
	"7d",
	"30d",
	"month",
	"6mo",
	"12mo",
	"year",
	"all",
]);
const dateRangeObjectSchema = z.union([
	z.object({ type: z.literal("preset"), value: dateRangePreset }),
	z.object({
		type: z.literal("custom"),
		startDate: z.string(),
		endDate: z.string(),
	}),
]);
const simpleFilterSchema = z.object({
	operator: z.enum([
		"is",
		"is_not",
		"contains",
		"contains_not",
		"matches",
		"matches_not",
	]),
	dimension: z.string(),
	values: z.array(z.string()),
});
const filterObjectSchema: z.ZodType<unknown> = z.lazy(() =>
	z.union([
		simpleFilterSchema,
		z.object({
			operator: z.enum(["and", "or"]),
			filters: z.array(simpleFilterSchema),
		}),
		z.object({ operator: z.literal("not"), filter: simpleFilterSchema }),
	]),
);
const orderBySchema = z.object({
	target: z.string(),
	direction: z.enum(["asc", "desc"]),
});
const analyticsOptionsSchema = z.object({
	date_range: dateRangeObjectSchema.describe(
		"Date range: { type: 'preset', value: '7d' } or { type: 'custom', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }",
	),
	metrics: z
		.array(z.string())
		.describe(
			"Metrics to compute, e.g. ['visitors', 'pageviews', 'visits', 'bounce_rate', 'visit_duration', 'events']",
		),
	dimensions: z
		.array(z.string())
		.optional()
		.describe(
			"Optional dimensions to group by, e.g. ['event:page', 'visit:country', 'time:day']",
		),
	filters: z
		.array(filterObjectSchema)
		.optional()
		.describe(
			"Optional filters, e.g. [{ operator: 'contains', dimension: 'event:page', values: ['/docs'] }]",
		),
	order_by: z
		.array(orderBySchema)
		.optional()
		.describe(
			"Optional sort, e.g. [{ target: 'visitors', direction: 'desc' }]",
		),
	include: z
		.object({
			imports: z.boolean().optional(),
			time_labels: z.boolean().optional(),
			total_rows: z.boolean().optional(),
		})
		.optional(),
	pagination: z
		.object({ limit: z.number(), offset: z.number() })
		.optional()
		.describe("e.g. { limit: 10, offset: 0 }"),
});

/**
 * analytics_query – run the site analytics query (Plausible / OneDollarStats).
 * Uses the same loader as the admin analytics UI; options match QueryOptionsObject.
 */
export const analyticsQueryTool = (env: Env) =>
	createTool({
		id: "analytics_query",
		description:
			"Query site analytics (Plausible or OneDollarStats). Pass hostname and options (date_range, metrics, optional dimensions, filters, order_by, include, pagination). Site from MCP context.",
		inputSchema: z.object({
			hostname: z.string().describe("Site hostname (e.g. www.example.com)"),
			options: analyticsOptionsSchema,
		}),
		outputSchema: z.object({ data: z.unknown() }),
		annotations: { readOnlyHint: true, destructiveHint: false },
		execute: async ({ context }) => {
			const { apiKey, site } = getConfig(env);
			const data = await callAdmin(
				ANALYTICS_QUERY_LOADER,
				{
					sitename: site,
					hostname: context.hostname,
					options: context.options,
				},
				apiKey,
			).catch(() => null);
			return { data };
		},
	});
