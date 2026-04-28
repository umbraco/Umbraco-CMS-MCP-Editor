import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";

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
    const itemResult = await chainCms("get-media-by-id", { id });
    if (!itemResult.ok) return itemResult.errorResult;
    const itemName = itemResult.data.variants?.[0]?.name ?? "Unknown";

    if (!await confirmStep(extra, `Delete "${itemName}"? It will be moved to the recycle bin.`)) {
      return createToolResult({ message: "Delete cancelled", id, name: itemName });
    }

    const deleteResult = await chainCms("move-media-to-recycle-bin", { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: `Moved "${itemName}" to the recycle bin`,
      id,
      name: itemName,
    });
  },
};

export default withStandardDecorators(tool);
