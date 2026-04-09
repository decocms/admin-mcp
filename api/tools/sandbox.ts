import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callAdmin, getConfig } from "../lib/admin.ts";

// ─── shared schemas ───────────────────────────────────────────────────────────

export const sandboxTaskSchema = z
	.object({
		taskId: z.string(),
		status: z.string(),
		issue: z.string().optional(),
		prompt: z.string().optional(),
		type: z.string().optional(),
		prUrl: z.string().nullable().optional(),
	})
	.passthrough();
export type SandboxTask = z.infer<typeof sandboxTaskSchema>;
// ─── create_sandbox_task ──────────────────────────────────────────────────────

export const createSandboxTaskInputSchema = z.object({
	env: z
		.string()
		.describe(
			"Name of the sandbox environment to run the task in (must have platform=sandbox)",
		),
	prompt: z
		.string()
		.optional()
		.describe("Free-text description of what the AI agent should do"),
	issue: z
		.string()
		.optional()
		.describe("GitHub issue URL for the AI agent to work on"),
});
export type CreateSandboxTaskInput = z.infer<
	typeof createSandboxTaskInputSchema
>;

export const createSandboxTaskOutputSchema = z.object({
	taskId: z.string(),
	status: z.string(),
	site: z.string(),
	env: z.string(),
	prompt: z.string().optional(),
	issue: z.string().optional(),
});
export type CreateSandboxTaskOutput = z.infer<
	typeof createSandboxTaskOutputSchema
>;

export const createSandboxTaskTool = createTool({
	id: "create_sandbox_task",
	description:
		"Create a new AI agent (Claude Code) task in a sandbox environment. The agent works autonomously on the given prompt or GitHub issue in an isolated Kubernetes pod. Returns a live terminal connection so you can watch the agent in real time. Requires a sandbox-platform environment.",
	inputSchema: createSandboxTaskInputSchema,
	outputSchema: createSandboxTaskOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: true,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);

		const [taskResult, authResult] = (await Promise.all([
			callAdmin(
				"deco-sites/admin/actions/daemon/sandbox/createTask.ts",
				{
					site,
					env: context.env,
					prompt: context.prompt,
					issue: context.issue,
				},
				apiKey,
			),
			callAdmin(
				"deco-sites/admin/loaders/daemon/sandbox/taskAuth.ts",
				{ site, env: context.env },
				apiKey,
			),
		])) as [
			{ taskId: string; status: string; error?: string },
			{ endpoint: string; token: string } | null,
		];

		if (taskResult.error) {
			throw new Error(`Failed to create task: ${taskResult.error}`);
		}

		if (!authResult) {
			throw new Error("Sandbox environment has no URL — is it running?");
		}

		return {
			taskId: taskResult.taskId,
			status: taskResult.status,
			site,
			env: context.env,
			prompt: context.prompt,
			issue: context.issue,
		};
	},
});

// ─── list_sandbox_tasks ───────────────────────────────────────────────────────

export const listSandboxTasksInputSchema = z.object({
	env: z.string().describe("The sandbox environment name"),
});
export type ListSandboxTasksInput = z.infer<typeof listSandboxTasksInputSchema>;

export const listSandboxTasksOutputSchema = z.object({
	tasks: z.array(sandboxTaskSchema),
	site: z.string(),
	env: z.string(),
});
export type ListSandboxTasksOutput = z.infer<
	typeof listSandboxTasksOutputSchema
>;

export const listSandboxTasksTool = createTool({
	id: "list_sandbox_tasks",
	description:
		"List all AI agent tasks in a sandbox environment with their status (running/completed/error). Returns terminal connection info to watch any task live.",
	inputSchema: listSandboxTasksInputSchema,
	outputSchema: listSandboxTasksOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);

		const [tasks, authResult] = (await Promise.all([
			callAdmin(
				"deco-sites/admin/loaders/daemon/sandbox/tasks.ts",
				{ site, env: context.env },
				apiKey,
			),
			callAdmin(
				"deco-sites/admin/loaders/daemon/sandbox/taskAuth.ts",
				{ site, env: context.env },
				apiKey,
			),
		])) as [SandboxTask[], { endpoint: string; token: string } | null];

		if (!authResult) {
			throw new Error("Sandbox environment has no URL — is it running?");
		}

		return {
			tasks: Array.isArray(tasks) ? tasks : [],
			site,
			env: context.env,
		};
	},
});

// ─── kill_sandbox_task ────────────────────────────────────────────────────────

export const killSandboxTaskInputSchema = z.object({
	env: z.string().describe("The sandbox environment name"),
	taskId: z.string().describe("The task ID to terminate"),
});
export type KillSandboxTaskInput = z.infer<typeof killSandboxTaskInputSchema>;

export const killSandboxTaskOutputSchema = z.object({
	ok: z.boolean(),
	taskId: z.string(),
	message: z.string(),
});
export type KillSandboxTaskOutput = z.infer<typeof killSandboxTaskOutputSchema>;

export const killSandboxTaskTool = createTool({
	id: "kill_sandbox_task",
	description: "Terminate a running AI agent task in a sandbox environment.",
	inputSchema: killSandboxTaskInputSchema,
	outputSchema: killSandboxTaskOutputSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: true,
	},
	execute: async ({ context }, ctx) => {
		const { site, apiKey } = getConfig(ctx);
		const result = (await callAdmin(
			"deco-sites/admin/actions/daemon/sandbox/killTask.ts",
			{ site, env: context.env, taskId: context.taskId },
			apiKey,
		)) as { ok?: boolean };
		return {
			ok: result.ok ?? true,
			taskId: context.taskId,
			message: `Task ${context.taskId} terminated.`,
		};
	},
});
