import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	pBetter,
	sampleSize as sampleSizeOf,
	type Variant,
} from "../lib/ab-test.ts";
import { callAdmin, decodeJwtPayload, getConfig } from "../lib/admin.ts";

export const EXPERIMENTS_RESOURCE_URI = "ui://mcp-app/experiments";

const EXPERIMENTS_LIST_LOADER = "deco-sites/admin/loaders/experiments/list.ts";
const EXPERIMENTS_CREATE_ACTION =
	"deco-sites/admin/actions/experiments/create.ts";
const SITES_DOMAINS_LOADER = "deco-sites/admin/loaders/sites/domains.ts";
const ANALYTICS_AGGREGATE_LOADER =
	"deco-sites/admin/loaders/analytics/aggregate.ts";
const ANALYTICS_TIMESERIES_LOADER =
	"deco-sites/admin/loaders/analytics/timeseries.ts";

// "visitors" is the implicit baseline goal — every stat is relative to it.
const VISITORS_GOAL = "visitors";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── shared schemas ─────────────────────────────────────────────────────────

// Mirrors the periods offered by the admin Experiments view (custom is a range).
const periodPreset = z.enum(["day", "7d", "30d", "month", "6mo", "12mo"]);

const dateRangeSchema = z.union([
	z.object({ type: z.literal("preset"), value: periodPreset }),
	z.object({
		type: z.literal("custom"),
		from: z.string().describe("YYYY-MM-DD"),
		to: z.string().describe("YYYY-MM-DD"),
	}),
]);

const filtersSchema = z
	.object({
		devices: z.array(z.string()).optional(),
		browsers: z.array(z.string()).optional(),
		os: z.array(z.string()).optional(),
	})
	.optional();

// Matches the `experiments` table (see admin clients/supabase/types.ts) — every
// column except `id` is nullable, so keep the schema equally permissive: a
// stricter shape would make the runtime reject the whole result on a single
// null field, which surfaces to the UI as "no experiments".
const experimentSchema = z
	.object({
		id: z.number(),
		name: z.string().nullable().optional(),
		status: z.string().nullable().optional(),
		description: z.string().nullable().optional(),
		startedAt: z.string().nullable().optional(),
		endedAt: z.string().nullable().optional(),
		site: z.string().nullable().optional(),
		createdBy: z.string().nullable().optional(),
		custom_goals: z.array(z.string()).nullable().optional(),
		variants: z.unknown().optional(),
	})
	.passthrough();

// ─── 1. Entry-point tool — launches the UI ────────────────────────────────────

export const listExperimentsTool = createTool({
	id: "list_experiments",
	title: "A/B Test Results",
	description:
		"Open the A/B test results dashboard for the configured deco.cx site. Lists the site's experiments and resolves its production domains, then launches the interactive results UI.",
	inputSchema: z.object({}),
	outputSchema: z.object({
		sitename: z.string(),
		hostname: z.string(),
		domains: z.array(z.string()),
		experiments: z.array(experimentSchema),
		// Diagnostic: populated when the experiments loader itself fails, so the
		// UI can distinguish "genuinely empty" from "the request errored".
		error: z.string().optional(),
	}),
	_meta: { ui: { resourceUri: EXPERIMENTS_RESOURCE_URI } },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async (_input, ctx) => {
		const { apiKey, site } = getConfig(ctx);

		type DomainEntry = { domain: string; production?: boolean };

		let experiments: z.infer<typeof experimentSchema>[] = [];
		let error: string | undefined;
		try {
			experiments = await invoke<z.infer<typeof experimentSchema>[]>(
				EXPERIMENTS_LIST_LOADER,
				{ site },
				apiKey,
			);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			console.error(`[list_experiments] site=${site} loader failed:`, error);
		}

		const domainEntries = await invoke<DomainEntry[]>(
			SITES_DOMAINS_LOADER,
			{ sitename: site },
			apiKey,
		).catch(() => [] as DomainEntry[]);

		const domains = domainEntries.map((d) => extractHostname(d.domain));

		return {
			sitename: site,
			hostname: domains[0] ?? "",
			domains,
			experiments: experiments ?? [],
			...(error ? { error } : {}),
		};
	},
});

// ─── 2. Create tool ────────────────────────────────────────────────────────────

/** Best-effort user email from the JWT, used for the `createdBy` column. */
function callerEmail(apiKey: string): string | undefined {
	const payload = decodeJwtPayload(apiKey);
	const user = payload?.user as Record<string, unknown> | undefined;
	const email = user?.email ?? payload?.email;
	return typeof email === "string" ? email : undefined;
}

/**
 * create_experiment — inserts a new experiment row so it shows up in the list.
 * Mirrors the admin `createExperiment` hook (Experiments/hooks.ts), minus the
 * traffic-split matcher block, which is configured separately in the editor.
 */
export const createExperimentTool = createTool({
	id: "create_experiment",
	title: "Create A/B Test",
	description:
		"Create a new A/B test experiment for the configured site. Returns the created experiment row.",
	inputSchema: z.object({
		name: z.string().min(1).describe("Experiment name"),
		description: z.string().optional().describe("Optional description"),
	}),
	outputSchema: z.object({
		experiment: experimentSchema.nullable(),
		error: z.string().optional(),
	}),
	annotations: { readOnlyHint: false, destructiveHint: false },
	execute: async ({ context }, ctx) => {
		const { apiKey, site } = getConfig(ctx);
		const { name, description } = context;

		try {
			// insertExperiment returns a Supabase PostgrestResponse (`.insert().select()`):
			// `{ data: [row], error }` — NOT the rows directly.
			const res = await invoke<{
				data?: z.infer<typeof experimentSchema>[] | null;
				error?: { message?: string } | null;
			} | null>(
				EXPERIMENTS_CREATE_ACTION,
				{
					site,
					name,
					description: description ?? "",
					status: "draft",
					startedAt: new Date().toISOString(),
					createdBy: callerEmail(apiKey),
					variants: [{ name }],
				},
				apiKey,
			);

			if (res?.error) {
				console.error(`[create_experiment] site=${site} error:`, res.error);
				return {
					experiment: null,
					error: res.error.message ?? "Insert failed.",
				};
			}

			const experiment = res?.data?.[0] ?? null;
			if (!experiment) {
				return {
					experiment: null,
					error:
						"Experiment was not created (no row returned — likely blocked by permissions).",
				};
			}
			return { experiment };
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			console.error(`[create_experiment] site=${site} failed:`, error);
			return { experiment: null, error };
		}
	},
});

// ─── 3. Results tool — analytics + A/B statistics ─────────────────────────────

type Filter = [string, string, string[]];
type DateRange = string | [string, string];
type AggregateRow = { metrics: number[] };
type TimeseriesRow = { dimensions: string[]; metrics: number[] };

function buildFilters(filters: z.infer<typeof filtersSchema>): {
	tuples: Filter[];
	dimensions: string[];
} {
	const tuples: Filter[] = [];
	if (filters?.devices?.length) {
		tuples.push(["is", "visit:device", filters.devices]);
	}
	if (filters?.browsers?.length) {
		tuples.push(["is", "visit:browser", filters.browsers]);
	}
	if (filters?.os?.length) {
		tuples.push(["is", "visit:os", filters.os]);
	}
	return { tuples, dimensions: tuples.map((f) => f[1]) };
}

function resolveDateRange(dr: z.infer<typeof dateRangeSchema>): DateRange {
	return dr.type === "custom" ? [dr.from, dr.to] : dr.value;
}

/**
 * experiment_results — reproduces the analytics + statistics the admin
 * Experiments view computes client-side, but server-side so the UI just renders.
 * See `deco-sites/admin/.../views/Experiments/Experiments.tsx` for the original.
 */
export const experimentResultsTool = createTool({
	id: "experiment_results",
	description:
		"Fetch A/B test results for an experiment: per-goal conversions for each variant, a daily timeseries for the selected goal, and the computed statistics (participants, target sample size, and probability each variant is best).",
	inputSchema: z.object({
		hostname: z.string().describe("Site hostname (e.g. www.example.com)"),
		testName: z
			.string()
			.describe("Experiment name — the event prop key variants are split on"),
		dateRange: dateRangeSchema,
		goals: z
			.array(z.string())
			.describe("Active goals to aggregate conversions for"),
		goalOnDash: z
			.string()
			.describe("Goal plotted in the timeseries / used for the statistics"),
		filters: filtersSchema,
	}),
	outputSchema: z.object({
		visitors: z.object({ default: z.number(), variant: z.number() }),
		goals: z.array(
			z.object({
				goal: z.string(),
				default: z.number(),
				variant: z.number(),
			}),
		),
		timeseries: z.array(
			z.object({
				date: z.string(),
				default: z.number(),
				variant: z.number(),
			}),
		),
		stats: z.object({
			totalParticipants: z.number(),
			sampleSize: z.number(),
			probabilityVariantBest: z.number(),
			probabilityDefaultBest: z.number(),
		}),
	}),
	annotations: { readOnlyHint: true, destructiveHint: false },
	execute: async ({ context }, ctx) => {
		const { apiKey, site } = getConfig(ctx);
		const { hostname, testName, goalOnDash } = context;
		const dateRange = resolveDateRange(context.dateRange);
		const { tuples: filterTuples, dimensions: filterDims } = buildFilters(
			context.filters,
		);
		const propKey = `event:props:${testName}`;

		// Always include the visitors baseline — the statistics depend on it.
		const goals = Array.from(new Set([VISITORS_GOAL, ...context.goals]));

		// The variant flag lives in the event prop: "true" = test, "false" = default.
		const aggregate = (goal: string, variant: string) =>
			invoke<AggregateRow[]>(
				ANALYTICS_AGGREGATE_LOADER,
				{
					sitename: site,
					hostname,
					query: {
						date_range: dateRange,
						metrics: ["visitors"],
						dimensions: [
							propKey,
							...(goal === VISITORS_GOAL ? [] : ["event:goal"]),
							...filterDims,
						],
						filters: [
							["is", propKey, [variant]],
							...(goal === VISITORS_GOAL ? [] : [["is", "event:goal", [goal]]]),
							...filterTuples,
						],
					},
				},
				apiKey,
			)
				.then((rows) => rows?.[0]?.metrics?.[0] ?? 0)
				.catch(() => 0);

		const timeseries = (variant: string) =>
			invoke<TimeseriesRow[]>(
				ANALYTICS_TIMESERIES_LOADER,
				{
					sitename: site,
					hostname,
					query: {
						date_range: dateRange,
						metrics: ["visitors"],
						dimensions: [
							"time:day",
							propKey,
							...(goalOnDash === VISITORS_GOAL ? [] : ["event:goal"]),
							...filterDims,
						],
						filters: [
							["is", propKey, [variant]],
							...(goalOnDash === VISITORS_GOAL
								? []
								: [["is", "event:goal", [goalOnDash]]]),
							...filterTuples,
						],
					},
				},
				apiKey,
			).catch(() => [] as TimeseriesRow[]);

		// Fire every request concurrently: 2 variants per goal + 2 timeseries.
		const [goalCounts, tsDefault, tsVariant] = await Promise.all([
			Promise.all(
				goals.map(async (goal) => ({
					goal,
					variant: await aggregate(goal, "true"),
					default: await aggregate(goal, "false"),
				})),
			),
			timeseries("false"),
			timeseries("true"),
		]);

		const visitorsRow = goalCounts.find((g) => g.goal === VISITORS_GOAL);
		const visitors = {
			default: visitorsRow?.default ?? 0,
			variant: visitorsRow?.variant ?? 0,
		};

		// Merge the two variant timeseries by day so the UI can plot them together.
		const byDate = new Map<string, { default: number; variant: number }>();
		for (const row of tsDefault) {
			const date = row.dimensions?.[0] ?? "";
			const entry = byDate.get(date) ?? { default: 0, variant: 0 };
			entry.default = row.metrics?.[0] ?? 0;
			byDate.set(date, entry);
		}
		for (const row of tsVariant) {
			const date = row.dimensions?.[0] ?? "";
			const entry = byDate.get(date) ?? { default: 0, variant: 0 };
			entry.variant = row.metrics?.[0] ?? 0;
			byDate.set(date, entry);
		}
		const mergedTimeseries = Array.from(byDate.entries())
			.map(([date, v]) => ({ date, ...v }))
			.sort((a, b) => a.date.localeCompare(b.date));

		// ── statistics (see api/lib/ab-test.ts) ────────────────────────────────
		const successDefault = tsDefault.reduce(
			(acc, r) => acc + (r.metrics?.[0] ?? 0),
			0,
		);
		const successVariant = tsVariant.reduce(
			(acc, r) => acc + (r.metrics?.[0] ?? 0),
			0,
		);
		const defaultVariant: Variant = {
			successes: successDefault,
			total: visitors.default,
		};
		const testVariant: Variant = {
			successes: successVariant,
			total: visitors.variant,
		};

		const rawSampleSize = sampleSizeOf(defaultVariant, testVariant);
		const sampleSize =
			rawSampleSize == null || Number.isNaN(rawSampleSize)
				? 1000
				: rawSampleSize;
		const probabilityVariantBest = pBetter(defaultVariant, testVariant);

		return {
			visitors,
			goals: goalCounts,
			timeseries: mergedTimeseries,
			stats: {
				totalParticipants: visitors.default + visitors.variant,
				sampleSize,
				probabilityVariantBest,
				probabilityDefaultBest: 1 - probabilityVariantBest,
			},
		};
	},
});
