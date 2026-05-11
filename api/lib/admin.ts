import type { AppContext } from "@decocms/runtime/tools";
import { createRuntimeContext } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

export const ADMIN_BASE_URL =
	process.env.DECO_ADMIN_URL ?? "https://admin-envs.deco.cx";

export async function callAdmin(
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

export function getEnv(ctx?: AppContext): Env {
	return createRuntimeContext(ctx).env as Env;
}

export function getConfig(ctx?: AppContext) {
	const env = getEnv(ctx);
	const state = env.MESH_REQUEST_CONTEXT?.state;
	const apiKey = env.MESH_REQUEST_CONTEXT?.authorization;
	const site = state?.SITE_NAME;
	if (!site) throw new Error("SITE_NAME is not configured.");
	if (!apiKey) throw new Error("DECO_ADMIN_API_KEY is not configured.");
	return {
		site,
		apiKey,
	};
}

// ─── JWT / env helpers ────────────────────────────────────────────────────────

export function decodeJwtPayload(
	token: string,
): Record<string, unknown> | null {
	try {
		const payloadB64 = token.split(".")[1];
		if (!payloadB64) return null;
		const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export async function getUserEnvName(apiKey: string): Promise<string> {
	const payload = decodeJwtPayload(apiKey);
	const userId =
		(payload?.user as Record<string, unknown> | undefined)?.id ??
		payload?.sub ??
		apiKey;
	const encoder = new TextEncoder();
	const data = encoder.encode(String(userId));
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${hashHex.slice(0, 9)}`;
}

// Mirror ENVIRONMENTS.consistentHash from admin/sdk/environments.ts
export function consistentHash(input: string): string {
	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

export function buildEnvUrl(site: string, env: string): string {
	return `https://envs-${site}--${consistentHash(env)}.decocdn.com`;
}

export async function resolveEnv(ctx?: AppContext): Promise<string> {
	const env = getEnv(ctx);
	const token = env.MESH_REQUEST_CONTEXT?.token;
	return getUserEnvName(token);
}
