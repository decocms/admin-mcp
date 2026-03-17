import type { Env } from "../types/env.ts";

export const ADMIN_BASE_URL =
	process.env.DECO_ADMIN_URL ?? "https://admin.deco.cx";

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

export function getConfig(env: Env) {
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
