import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import {
  validateBulkIds,
  executeBulkSequentially,
  buildBulkOutput,
  type BulkOperationOutput,
} from "../../helpers/bulk-handler.js";

const inputSchema = {
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the media items or folders to move (max 10)"),
  targetParentId: z.string().uuid().describe("The ID of the destination folder"),
};

const outputSchema = z.object({
  message: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-move-media",
  description: "Move multiple media items or folders to a different folder (max 10). Lists each item name and destination for confirmation before moving. Sequential execution stops on first failure.",
  inputSchema,
  outputSchema,
  slices: ["move"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ ids, targetParentId }, extra) => {
    // 1. Validate cap
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult(validationError as BulkOperationOutput);

    // 2. Fetch media names in parallel
    const itemDetails = await Promise.all(
      ids.map(async (id) => {
        try {
          const result = await mcpClientManager.callTool("cms", "get-media-by-id", { id });
          if (result.isError) return { id, name: "Unknown", currentVersionId: "" };
          const media = extractChainedResult(result);
          return { id, name: media.name ?? "Unknown", currentVersionId: "" };
        } catch {
          return { id, name: "Unknown", currentVersionId: "" };
        }
      }),
    );

    if (itemDetails.every(i => i.name === "Unknown")) {
      return createToolResult({
        message: "Could not fetch media details",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 3. Fetch target folder name
    let targetName = targetParentId;
    try {
      const targetResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: targetParentId });
      if (!targetResult.isError) {
        const target = extractChainedResult(targetResult);
        targetName = target.name ?? targetParentId;
      }
    } catch {
      // Fall back to showing the ID
    }

    // 4. Confirm
    const nameList = itemDetails.map(i => `- ${i.name}`).join("\n");
    const message = `Move these ${itemDetails.length} media items to '${targetName}'?\n${nameList}`;

    if (!await confirmAction(extra, message, { title: "Confirm bulk move media", defaultValue: false })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 5. Execute sequentially
    const results = await executeBulkSequentially(itemDetails, async (item) => {
      const result = await mcpClientManager.callTool("cms", "move-media", {
        id: item.id,
        target: { id: targetParentId },
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Move failed";
      }
      return null;
    });

    // 6. Build output — override message to say "media items" instead of "pages"
    const output = buildBulkOutput("Moved", results);
    output.message = output.message.replace("pages", "media items");
    return createToolResult(output);
  },
};

export default withStandardDecorators(tool);
