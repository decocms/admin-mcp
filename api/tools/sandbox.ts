import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const SANDBOX_RESOURCE_URI = "ui://mcp-app/sandbox";

const ADMIN_BASE_URL = process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function callAdmin(
	path: string,
	body: unknown,
	apiKey: string,
): Promise<unknown> {
	const res = await fetch(`${ADMIN_BASE_URL}/live/invoke/${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(`Admin API error (${res.status}): ${text}`);
	}
	return res.json();
}

function getConfig(env: Env) {
	const state = env.MESH_REQUEST_CONTEXT?.state;
	const apiKey = state?.DECO_ADMIN_API_KEY;
	const site = state?.SITE_NAME;
	if (!site) throw new Error("SITE_NAME is not configured.");
	if (!apiKey) throw new Error("DECO_ADMIN_API_KEY is not configured.");
	return { site, apiKey };
}

function toWss(endpoint: string): string {
	return endpoint.replace(/^https/, "wss").replace(/^http(?!s)/, "ws");
}

// ─── shared schemas ───────────────────────────────────────────────────────────

export const sandboxTaskSchema = z
	.object({
		taskId: z.string(),
		status: z.string(),
		issue: z.string().optional(),
		prompt: z.string().optional(),
		createdAt: z.string().optional(),
	})
	.passthrough();
export type SandboxTask = z.infer<typeof sandboxTaskSchema>;

// The wsEndpoint is the raw pod URL (https→wss already converted).
// wsUrl is built in the UI as: `${wsEndpoint}/sandbox/tasks/${taskId}/ws?token=${wsToken}`
const wsAuthFields = {
	wsEndpoint: z.string().describe("WebSocket base URL of the sandbox pod"),
	wsToken: z.string().describe("JWT token for the WebSocket connection"),
};

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
	...wsAuthFields,
});
export type CreateSandboxTaskOutput = z.infer<
	typeof createSandboxTaskOutputSchema
>;

export const createSandboxTaskTool = (env: Env) =>
	createTool({
		id: "create_sandbox_task",
		description:
			"Create a new AI agent (Claude Code) task in a sandbox environment. The agent works autonomously on the given prompt or GitHub issue in an isolated Kubernetes pod. Returns a live terminal connection so you can watch the agent in real time. Requires a sandbox-platform environment.",
		inputSchema: createSandboxTaskInputSchema,
		outputSchema: createSandboxTaskOutputSchema,
		_meta: { ui: { resourceUri: SANDBOX_RESOURCE_URI } },
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);

			const [taskResult, authResult] = (await Promise.all([
				callAdmin(
					"deco-sites/admin/actions/daemon/sandbox/createTask.ts",
					{ site, env: context.env, prompt: context.prompt, issue: context.issue },
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
				wsEndpoint: toWss(authResult.endpoint),
				wsToken: authResult.token,
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
	...wsAuthFields,
});
export type ListSandboxTasksOutput = z.infer<
	typeof listSandboxTasksOutputSchema
>;

export const listSandboxTasksTool = (env: Env) =>
	createTool({
		id: "list_sandbox_tasks",
		description:
			"List all AI agent tasks in a sandbox environment with their status (running/completed/error). Returns terminal connection info to watch any task live.",
		inputSchema: listSandboxTasksInputSchema,
		outputSchema: listSandboxTasksOutputSchema,
		_meta: { ui: { resourceUri: SANDBOX_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);

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
			])) as [
				SandboxTask[],
				{ endpoint: string; token: string } | null,
			];

			if (!authResult) {
				throw new Error("Sandbox environment has no URL — is it running?");
			}

			return {
				tasks: Array.isArray(tasks) ? tasks : [],
				site,
				env: context.env,
				wsEndpoint: toWss(authResult.endpoint),
				wsToken: authResult.token,
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

export const killSandboxTaskTool = (env: Env) =>
	createTool({
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
		execute: async ({ context }) => {
			const { site, apiKey } = getConfig(env);
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
