import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to publish"),
  includeDescendants: z.boolean().optional().default(false).describe("Whether to also publish all child pages"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "publish-page",
  description: "Publish a content page to make it live on the website. Optionally publish all child pages too. You will be asked to confirm before publishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, includeDescendants }, extra) => {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    const message = includeDescendants
      ? `Publish "${pageName}" and all its child pages to the live site?`
      : `Publish "${pageName}" to the live site?`;

    if (!await confirmAction(extra, message, { title: "Confirm publish" })) {
      return createToolResult({ message: "Publish cancelled", id, name: pageName });
    }

    const toolName = includeDescendants ? "publish-document-with-descendants" : "publish-document";
    const publishResult = await mcpClientManager.callTool("cms", toolName, { id, data: { publishSchedules: [] } });
    if (publishResult.isError) return createToolResultError(publishResult);

    return createToolResult({
      message: includeDescendants ? `Published "${pageName}" and all child pages` : `Published "${pageName}"`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
