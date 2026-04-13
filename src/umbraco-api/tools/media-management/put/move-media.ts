import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the media item or folder to move"),
  targetParentId: z.string().uuid().describe("The ID of the destination folder"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "move-media",
  description: "Move a media item or folder to a different folder in the media library. Moving to the root level is not supported. You will be asked to confirm before moving.",
  inputSchema,
  outputSchema,
  slices: ["move"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, targetParentId }, extra) => {
    // Step 1: Fetch item and target names for confirmation
    const [itemResult, targetResult] = await Promise.all([
      mcpClientManager.callTool("cms", "get-media-by-id", { id }),
      mcpClientManager.callTool("cms", "get-media-by-id", { id: targetParentId }),
    ]);

    if (itemResult.isError) return createToolResultError(itemResult);
    if (targetResult.isError) return createToolResultError(targetResult);

    const item = extractChainedResult(itemResult);
    const target = extractChainedResult(targetResult);
    const itemName = item.name ?? "Unknown";
    const targetName = target.name ?? "Unknown";

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Move "${itemName}" to "${targetName}"?`, { title: "Confirm move" })) {
      return createToolResult({ message: "Move cancelled", id, name: itemName });
    }

    // Step 3: Delegate to CMS
    const moveResult = await mcpClientManager.callTool("cms", "move-media", {
      id,
      data: { target: { id: targetParentId } },
    });
    if (moveResult.isError) return createToolResultError(moveResult);

    return createToolResult({
      message: `Moved "${itemName}" to "${targetName}"`,
      id,
      name: itemName,
    });
  },
};

export default withStandardDecorators(tool);
