import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
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
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult(validationError as BulkOperationOutput);

    const itemDetails = await Promise.all(
      ids.map(async (id) => {
        try {
          const result = await chainCms("get-media-by-id", { id });
          if (!result.ok) return { id, name: "Unknown", currentVersionId: "" };
          return { id, name: result.data.variants?.[0]?.name ?? "Unknown", currentVersionId: "" };
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

    let targetName = targetParentId;
    try {
      const targetResult = await chainCms("get-media-by-id", { id: targetParentId });
      if (targetResult.ok) {
        targetName = targetResult.data.variants?.[0]?.name ?? targetParentId;
      }
    } catch {
      // Fall back to showing the ID
    }

    const nameList = itemDetails.map(i => `- ${i.name}`).join("\n");
    const message = `Move these ${itemDetails.length} media items to '${targetName}'?\n${nameList}`;

    if (!await confirmStep(extra, message)) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    const results = await executeBulkSequentially(itemDetails, async (item) => {
      const result = await chainCms("move-media", {
        id: item.id,
        data: { target: { id: targetParentId } },
      });
      if (!result.ok) {
        return result.errorResult.content?.[0]?.text ?? "Move failed";
      }
      return null;
    });

    const output = buildBulkOutput("Moved", results);
    output.message = output.message.replace("pages", "media items");
    return createToolResult(output);
  },
};

export default withStandardDecorators(tool);
