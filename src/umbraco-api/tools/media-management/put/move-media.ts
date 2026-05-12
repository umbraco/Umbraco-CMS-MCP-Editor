import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const [itemResult, targetResult] = await Promise.all([
      chainCms("get-media-by-id", { id }),
      chainCms("get-media-by-id", { id: targetParentId }),
    ]);

    if (!itemResult.ok) return itemResult.errorResult;
    if (!targetResult.ok) return targetResult.errorResult;

    const itemName = itemResult.data.variants?.[0]?.name ?? "Unknown";
    const targetName = targetResult.data.variants?.[0]?.name ?? "Unknown";

    if (!await requestApproval(extra, `Move "${itemName}" to "${targetName}"?`)) {
      return createToolResult({ message: "Move cancelled", id, name: itemName });
    }

    const moveResult = await chainCms("move-media", {
      id,
      data: { target: { id: targetParentId } },
    });
    if (!moveResult.ok) return moveResult.errorResult;

    return createToolResult({
      message: `Moved "${itemName}" to "${targetName}"`,
      id,
      name: itemName,
    });
  },
};

export default withStandardDecorators(tool);
