import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { storefrontSkillsPrompts } from "./prompts/storefront-skills.ts";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

function getDistPath(): string {
	const IS_PRODUCTION = process.env.NODE_ENV === "production";
	const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "..");
	return join(projectRoot, "dist", "client", "index.html");
}

const handler = createApp({
	getClientHTML: () => readFile(getDistPath(), "utf-8"),
	prompts: storefrontSkillsPrompts,
});

Bun.serve({
	idleTimeout: 0,
	hostname: "0.0.0.0",
	port: PORT,
	fetch: handler,
});

console.log(`MCP App server started on http://localhost:${PORT}`);
console.log(`- MCP endpoint: http://localhost:${PORT}/api/mcp`);
