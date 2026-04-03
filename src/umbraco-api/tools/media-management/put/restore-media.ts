import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the media item to restore from the recycle bin"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "restore-media",
  description: "Restore a media item from the recycle bin. You will be asked to confirm before restoring.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch item name for confirmation
    const itemResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id });
    if (itemResult.isError) return createToolResultError(itemResult);
    const item = extractChainedResult(itemResult);
    const itemName = item.name ?? "Unknown";

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Restore "${itemName}" from the recycle bin?`, { title: "Confirm restore" })) {
      return createToolResult({ message: "Restore cancelled", id, name: itemName });
    }

    // Step 3: Restore from recycle bin
    const restoreResult = await mcpClientManager.callTool("cms", "restore-media-from-recycle-bin", { id });
    if (restoreResult.isError) return createToolResultError(restoreResult);

    return createToolResult({
      message: `Restored "${itemName}" from the recycle bin`,
      id,
      name: itemName,
    });
  },
};

export default withStandardDecorators(tool);
