import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to restore from the recycle bin"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "restore-page",
  description: "Restore a content page from the recycle bin to its original location. You will be asked to confirm before restoring.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch page details for confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Restore "${pageName}" from the recycle bin?`, { title: "Confirm restore" })) {
      return createToolResult({ message: "Restore cancelled", id, name: pageName });
    }

    // Step 3: Restore from recycle bin
    const restoreResult = await mcpClientManager.callTool("cms", "restore-document-from-recycle-bin", { id });
    if (restoreResult.isError) return createToolResultError(restoreResult);

    return createToolResult({
      message: `Restored "${pageName}" from the recycle bin`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
