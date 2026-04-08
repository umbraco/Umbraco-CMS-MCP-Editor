import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to schedule for publish"),
  publishDate: z.string().datetime().describe("The date and time to publish the page (ISO 8601 format, must be in the future)"),
  culture: z.string().optional().describe("Culture code for variant-specific scheduling (e.g. 'en-US'). Omit for invariant content."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  scheduledDate: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "schedule-publish",
  description: "Schedule a page to publish at a future date. Provide the date in ISO 8601 format (must be in the future). Optionally specify a culture for variant-specific scheduling. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, publishDate, culture }, extra) => {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    if (!await confirmAction(extra, `Schedule "${pageName}" to publish on ${publishDate}?`, { title: "Confirm schedule publish" })) {
      return createToolResult({ message: "Schedule publish cancelled", id, name: pageName, scheduledDate: publishDate });
    }

    const publishResult = await mcpClientManager.callTool("cms", "publish-document", {
      id,
      data: { publishSchedules: [{ culture: culture ?? null, schedule: publishDate }] },
    });
    if (publishResult.isError) return createToolResultError(publishResult);

    const cultureLabel = culture ? ` (${culture})` : "";
    return createToolResult({
      message: `Scheduled "${pageName}"${cultureLabel} to publish on ${publishDate}`,
      id,
      name: pageName,
      scheduledDate: publishDate,
    });
  },
};

export default withStandardDecorators(tool);
