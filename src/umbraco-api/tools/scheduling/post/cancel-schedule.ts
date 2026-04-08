import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page whose scheduled publish should be cancelled"),
  culture: z.string().optional().describe("Culture code to check for a scheduled variant (e.g. 'en-US'). Omit for invariant content."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "cancel-schedule",
  description: "Cancel a pending scheduled publish for a page. Use get-publish-status to verify the page has a pending schedule. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, culture }, extra) => {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Check if a schedule exists; 404 (isError) means unpublished — no schedule present
    const publishResult = await mcpClientManager.callTool("cms", "get-document-publish", { id });

    if (publishResult.isError) {
      return createToolResult({ message: "No scheduled publish found for this page", id, name: pageName });
    }

    const publishData = extractChainedResult(publishResult);
    const variants: any[] = publishData?.variants ?? [];

    const hasSchedule = variants.some((v: any) => {
      if (culture && v.culture !== culture) return false;
      return v.scheduledPublishDate !== null && v.scheduledPublishDate !== undefined;
    });

    if (!hasSchedule) {
      return createToolResult({ message: "No scheduled publish found for this page", id, name: pageName });
    }

    if (!await confirmAction(extra, `Cancel the scheduled publish for "${pageName}"?`, { title: "Confirm cancel schedule" })) {
      return createToolResult({ message: "Cancel schedule aborted", id, name: pageName });
    }

    const cancelResult = await mcpClientManager.callTool("cms", "publish-document", {
      id,
      data: { publishSchedules: [] },
    });
    if (cancelResult.isError) return createToolResultError(cancelResult);

    return createToolResult({
      message: `Cancelled scheduled publish for "${pageName}"`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
