import { createApp } from "./app.ts";

interface AssetsFetcher {
	fetch(input: string | Request): Promise<Response>;
}

interface WorkerEnv {
	ASSETS: AssetsFetcher;
}

let cachedHandler: ReturnType<typeof createApp> | null = null;

function getHandler(env: WorkerEnv): ReturnType<typeof createApp> {
	if (cachedHandler) return cachedHandler;

	let cachedHTML: string | null = null;
	const getClientHTML = async (): Promise<string> => {
		if (cachedHTML !== null) return cachedHTML;
		const res = await env.ASSETS.fetch("https://assets.local/index.html");
		cachedHTML = await res.text();
		return cachedHTML;
	};

	cachedHandler = createApp({ getClientHTML });
	return cachedHandler;
}

export default {
	fetch(request: Request, env: WorkerEnv, ctx: unknown): Promise<Response> {
		return Promise.resolve(getHandler(env)(request, env, ctx));
	},
};
