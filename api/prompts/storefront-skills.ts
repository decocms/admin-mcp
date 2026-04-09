import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { createPublicPrompt } from "@decocms/runtime/tools";

const DEFAULT_SKILLS_PATH = join(import.meta.dir, "../../storefront-skills");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileEntry {
	path: string;
	content: string;
}

// ---------------------------------------------------------------------------
// Local filesystem source (development)
// ---------------------------------------------------------------------------

async function collectLocalFiles(dir: string): Promise<string[]> {
	const results: string[] = [];

	async function walk(currentDir: string) {
		let entries: Dirent[];
		try {
			entries = await readdir(currentDir, { withFileTypes: true });
		} catch {
			return;
		}

		const hasSkillMd = entries.some((e) => e.isFile() && e.name === "SKILL.md");

		for (const entry of entries) {
			if (entry.name === ".git") continue;
			const fullPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (
				entry.isFile() &&
				extname(entry.name) === ".md" &&
				entry.name !== "README.md"
			) {
				if (hasSkillMd && entry.name !== "SKILL.md") continue;
				results.push(fullPath);
			}
		}
	}

	await walk(dir);
	return results;
}

async function fetchFromLocal(dir: string): Promise<FileEntry[]> {
	const files = await collectLocalFiles(dir);
	return Promise.all(
		files.map(async (filePath) => ({
			path: relative(dir, filePath),
			content: await readFile(filePath, "utf-8"),
		})),
	);
}

// ---------------------------------------------------------------------------
// Name / title / description helpers
// ---------------------------------------------------------------------------

function skillLabel(filePath: string): string {
	const file = basename(filePath);
	const raw =
		file.toUpperCase() === "SKILL.MD"
			? basename(filePath.replace(/[\\/][^\\/]+$/, "")) // parent folder
			: basename(filePath, extname(filePath)); // file stem
	return raw.replace(/-/g, "-");
}

function pathToPromptName(filePath: string): string {
	return skillLabel(filePath).replace(/\s+/g, "_").toLowerCase();
}

function pathToTitle(filePath: string): string {
	return skillLabel(filePath);
}

function pathToDescription(filePath: string): string {
	return skillLabel(filePath);
}

function frontmatterDescription(content: string): string | undefined {
	const match = content.match(/^---[\r\n]([\s\S]*?)[\r\n]---/);
	if (!match) return undefined;
	const descMatch = match[1].match(/^description:\s*(.+)$/m);
	return descMatch?.[1].trim() || undefined;
}

// ---------------------------------------------------------------------------
// Prompts factory
// ---------------------------------------------------------------------------

export const storefrontSkillsPrompts = async () => {
	const skillsPath = process.env.STOREFRONT_SKILLS_PATH ?? DEFAULT_SKILLS_PATH;

	const entries = await fetchFromLocal(skillsPath);

	return entries.map(({ path: filePath, content }) => {
		const description =
			frontmatterDescription(content) ?? pathToDescription(filePath);
		return createPublicPrompt({
			name: pathToPromptName(filePath),
			title: pathToTitle(filePath),
			description,
			execute: () => ({
				description,
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text:
								content.trim() ||
								`(This skill file is currently empty: ${filePath})`,
						},
					},
				],
			}),
		});
	});
};
