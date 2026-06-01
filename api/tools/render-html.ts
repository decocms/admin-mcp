import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";

// ─── render_html ──────────────────────────────────────────────────────────────

export const renderHtmlInputSchema = z.object({
	html: z.string().describe("The HTML content to render."),
});
export type RenderHtmlInput = z.infer<typeof renderHtmlInputSchema>;

export const renderHtmlOutputSchema = z.object({
	html: z.string(),
});
export type RenderHtmlOutput = z.infer<typeof renderHtmlOutputSchema>;

export const renderHtmlTool = createTool({
	id: "render_html",
	description:
		"Render arbitrary HTML visually in the chat. Use this to display visual examples, previews, mockups, or any HTML content the user needs to see.",
	inputSchema: renderHtmlInputSchema,
	outputSchema: renderHtmlOutputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	execute: async ({ context }) => {
		return { html: context.html };
	},
});
