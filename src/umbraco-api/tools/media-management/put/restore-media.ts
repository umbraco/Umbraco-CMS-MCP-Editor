import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const itemResult = await chainCms("get-media-by-id", { id });
    if (!itemResult.ok) return itemResult.errorResult;
    const itemName = itemResult.data.variants?.[0]?.name ?? "Unknown";

    if (!await confirmAction(extra, `Restore "${itemName}" from the recycle bin?`, { title: "Confirm restore" })) {
      return createToolResult({ message: "Restore cancelled", id, name: itemName });
    }

    const restoreResult = await chainCms("restore-media-from-recycle-bin", { id });
    if (!restoreResult.ok) return restoreResult.errorResult;

    return createToolResult({
      message: `Restored "${itemName}" from the recycle bin`,
      id,
      name: itemName,
    });
  },
};

export default withStandardDecorators(tool);
