import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";

export const SCHEDULED_RELEASES_RESOURCE_URI =
	"ui://mcp-app/scheduled-releases";

// ─── schemas ──────────────────────────────────────────────────────────────────

export const scheduledChangeSchema = z.object({
	pagePath: z.string().describe("Page path the change targets, e.g. '/'"),
	sectionLabel: z
		.string()
		.describe("Human-readable section label, e.g. 'Hero'"),
	sectionIndex: z
		.number()
		.describe("Index of the section on the page (0-based)"),
	previewSnippet: z
		.string()
		.optional()
		.describe("Short snippet of the new content for previewing"),
});
export type ScheduledChange = z.infer<typeof scheduledChangeSchema>;

export const releaseStatusSchema = z.enum(["scheduled", "live", "ended"]);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

export const scheduledReleaseSchema = z.object({
	id: z.string(),
	name: z.string().describe("Display name of the release"),
	startDate: z
		.string()
		.nullable()
		.describe(
			"ISO 8601 timestamp when the release goes live; null = not yet scheduled",
		),
	endDate: z
		.string()
		.nullable()
		.describe(
			"ISO 8601 timestamp when the release ends; null means permanent ship",
		),
	status: releaseStatusSchema,
	changes: z.array(scheduledChangeSchema),
});
export type ScheduledRelease = z.infer<typeof scheduledReleaseSchema>;

// ─── persistence ──────────────────────────────────────────────────────────────
//
// Releases are persisted to a JSON file on the API server's local disk so they
// survive dev-server restarts. This is a stand-in for the eventual variant-
// backed format (where a release is a logical grouping of date-matched variants
// stored across .deco/blocks/*.json files in the user's sandbox env).

const STORE_PATH = join(process.cwd(), ".context", "scheduled-releases.json");

async function readStore(): Promise<ScheduledRelease[]> {
	try {
		const text = await readFile(STORE_PATH, "utf-8");
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		return parsed as ScheduledRelease[];
	} catch {
		return [];
	}
}

async function writeStore(releases: ScheduledRelease[]): Promise<void> {
	await mkdir(dirname(STORE_PATH), { recursive: true });
	await writeFile(STORE_PATH, JSON.stringify(releases, null, 2));
}

function deriveStatus(
	startIso: string | null,
	endIso: string | null,
): ReleaseStatus {
	if (!startIso) return "scheduled";
	const now = Date.now();
	const start = new Date(startIso).getTime();
	if (now < start) return "scheduled";
	if (endIso) {
		const end = new Date(endIso).getTime();
		if (now >= end) return "ended";
	}
	return "live";
}

function withDerivedStatus(release: ScheduledRelease): ScheduledRelease {
	return {
		...release,
		status: deriveStatus(release.startDate, release.endDate),
	};
}

function sortByDate(a: ScheduledRelease, b: ScheduledRelease): number {
	const ta = a.startDate ? new Date(a.startDate).getTime() : Infinity;
	const tb = b.startDate ? new Date(b.startDate).getTime() : Infinity;
	return ta - tb;
}

// ─── list_scheduled_releases ─────────────────────────────────────────────────

export const listScheduledReleasesInputSchema = z.object({
	env: z.string().optional().describe("Sandbox environment (unused for now)"),
});
export type ListScheduledReleasesInput = z.infer<
	typeof listScheduledReleasesInputSchema
>;

export const listScheduledReleasesOutputSchema = z.object({
	releases: z.array(scheduledReleaseSchema),
});
export type ListScheduledReleasesOutput = z.infer<
	typeof listScheduledReleasesOutputSchema
>;

export const listScheduledReleasesTool = createTool({
	id: "list_scheduled_releases",
	description:
		"List all releases (campaigns and permanent ships). Backed by a local JSON store until variant-backed persistence lands.",
	inputSchema: listScheduledReleasesInputSchema,
	outputSchema: listScheduledReleasesOutputSchema,
	_meta: { ui: { resourceUri: SCHEDULED_RELEASES_RESOURCE_URI } },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async () => {
		const releases = (await readStore())
			.map(withDerivedStatus)
			.sort(sortByDate);
		return { releases };
	},
});

// ─── create_scheduled_release ────────────────────────────────────────────────

export const createScheduledReleaseInputSchema = z.object({
	env: z.string().optional().describe("Sandbox environment (unused for now)"),
	name: z.string().describe("Display name (required)"),
	startDate: z
		.string()
		.optional()
		.describe(
			"Optional ISO 8601 timestamp when the release goes live; omit to leave unscheduled",
		),
	endDate: z
		.string()
		.optional()
		.describe("Optional ISO 8601 timestamp when the release ends"),
});
export type CreateScheduledReleaseInput = z.infer<
	typeof createScheduledReleaseInputSchema
>;

export const createScheduledReleaseOutputSchema = z.object({
	release: scheduledReleaseSchema,
});
export type CreateScheduledReleaseOutput = z.infer<
	typeof createScheduledReleaseOutputSchema
>;

export const createScheduledReleaseTool = createTool({
	id: "create_scheduled_release",
	description:
		"Create a new release. The release is stored in a local JSON file; variant-backed persistence is wired up in a follow-up.",
	inputSchema: createScheduledReleaseInputSchema,
	outputSchema: createScheduledReleaseOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }) => {
		const id = `rel_${crypto.randomUUID().slice(0, 8)}`;
		const release: ScheduledRelease = {
			id,
			name: context.name.trim(),
			startDate: context.startDate ?? null,
			endDate: context.endDate ?? null,
			status: deriveStatus(context.startDate ?? null, context.endDate ?? null),
			changes: [],
		};
		const releases = await readStore();
		releases.push(release);
		await writeStore(releases);
		return { release };
	},
});

// ─── add_change_to_release ────────────────────────────────────────────────────
//
// Until variant-wrapping lands, records the change as a placeholder so the user
// can visually verify that their action attached to the right release.

export const addChangeToReleaseInputSchema = z.object({
	env: z.string(),
	releaseId: z.string(),
	pagePath: z.string().optional().describe("Page path the change targets"),
	sectionLabel: z.string().optional().describe("Section label"),
	sectionIndex: z
		.number()
		.optional()
		.describe("Section's position in the page's sections array"),
});
export type AddChangeToReleaseInput = z.infer<
	typeof addChangeToReleaseInputSchema
>;

export const addChangeToReleaseOutputSchema = z.object({
	ok: z.boolean(),
	releaseId: z.string(),
	release: scheduledReleaseSchema.nullable(),
});
export type AddChangeToReleaseOutput = z.infer<
	typeof addChangeToReleaseOutputSchema
>;

export const addChangeToReleaseTool = createTool({
	id: "add_change_to_release",
	description:
		"Attach the current sandbox changes to an existing release. Records a placeholder change until variant-backed persistence lands.",
	inputSchema: addChangeToReleaseInputSchema,
	outputSchema: addChangeToReleaseOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }) => {
		const releases = await readStore();
		const idx = releases.findIndex((r) => r.id === context.releaseId);
		if (idx === -1) {
			return { ok: false, releaseId: context.releaseId, release: null };
		}
		const release = releases[idx];
		const updated: ScheduledRelease = {
			...release,
			changes: [
				...release.changes,
				{
					pagePath: context.pagePath ?? "/",
					sectionLabel: context.sectionLabel ?? "Section",
					sectionIndex: context.sectionIndex ?? release.changes.length,
					previewSnippet: "Pending — variant wiring",
				},
			],
		};
		releases[idx] = updated;
		await writeStore(releases);
		return {
			ok: true,
			releaseId: release.id,
			release: withDerivedStatus(updated),
		};
	},
});

// ─── cancel_scheduled_release ────────────────────────────────────────────────

export const cancelScheduledReleaseInputSchema = z.object({
	releaseId: z.string(),
});
export type CancelScheduledReleaseInput = z.infer<
	typeof cancelScheduledReleaseInputSchema
>;

export const cancelScheduledReleaseOutputSchema = z.object({
	ok: z.boolean(),
	releaseId: z.string(),
});
export type CancelScheduledReleaseOutput = z.infer<
	typeof cancelScheduledReleaseOutputSchema
>;

export const cancelScheduledReleaseTool = createTool({
	id: "cancel_scheduled_release",
	description: "Remove a release and all of its scheduled changes.",
	inputSchema: cancelScheduledReleaseInputSchema,
	outputSchema: cancelScheduledReleaseOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }) => {
		const releases = await readStore();
		const next = releases.filter((r) => r.id !== context.releaseId);
		await writeStore(next);
		return {
			ok: next.length !== releases.length,
			releaseId: context.releaseId,
		};
	},
});

// ─── reschedule_scheduled_release ────────────────────────────────────────────

export const rescheduleScheduledReleaseInputSchema = z.object({
	releaseId: z.string(),
	startDate: z
		.string()
		.nullable()
		.describe("New start ISO timestamp, or null to unschedule"),
	endDate: z
		.string()
		.nullable()
		.optional()
		.describe("New end ISO timestamp, or null/omit for permanent ship"),
});
export type RescheduleScheduledReleaseInput = z.infer<
	typeof rescheduleScheduledReleaseInputSchema
>;

export const rescheduleScheduledReleaseOutputSchema = z.object({
	ok: z.boolean(),
	release: scheduledReleaseSchema.nullable(),
});
export type RescheduleScheduledReleaseOutput = z.infer<
	typeof rescheduleScheduledReleaseOutputSchema
>;

export const rescheduleScheduledReleaseTool = createTool({
	id: "reschedule_scheduled_release",
	description: "Update a release's start and/or end date.",
	inputSchema: rescheduleScheduledReleaseInputSchema,
	outputSchema: rescheduleScheduledReleaseOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	execute: async ({ context }) => {
		const releases = await readStore();
		const idx = releases.findIndex((r) => r.id === context.releaseId);
		if (idx === -1) return { ok: false, release: null };
		const updated: ScheduledRelease = {
			...releases[idx],
			startDate: context.startDate,
			endDate: context.endDate ?? null,
			status: deriveStatus(context.startDate, context.endDate ?? null),
		};
		releases[idx] = updated;
		await writeStore(releases);
		return { ok: true, release: updated };
	},
});
