import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the media item to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-media",
  description: "Move a media item to the recycle bin. The item can be restored later if needed. You will be asked to confirm before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch item name for confirmation
    const itemResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id });
    if (itemResult.isError) return createToolResultError(itemResult);
    const item = extractChainedResult(itemResult);
    const itemName = item.name ?? "Unknown";

    // Step 2: Elicit confirmation (default: false for destructive action)
    if (!await confirmAction(extra, `Delete "${itemName}"? It will be moved to the recycle bin.`, { title: "Confirm delete", defaultValue: false })) {
      return createToolResult({ message: "Delete cancelled", id, name: itemName });
    }

    // Step 3: Move to recycle bin
    const deleteResult = await mcpClientManager.callTool("cms", "move-media-to-recycle-bin", { id });
    if (deleteResult.isError) return createToolResultError(deleteResult);

    return createToolResult({
      message: `Moved "${itemName}" to the recycle bin`,
      id,
      name: itemName,
    });
  },
};

export default withStandardDecorators(tool);
