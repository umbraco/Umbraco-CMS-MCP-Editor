import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import {
  validateBulkIds,
  fetchBulkItemDetails,
  executeBulkSequentially,
  buildBulkOutput,
  type BulkOperationOutput,
} from "../../helpers/bulk-handler.js";

const inputSchema = {
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to move (max 10)"),
  targetParentId: z.string().uuid().describe("The ID of the destination parent page to move the pages into"),
};

const outputSchema = z.object({
  message: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    success: z.boolean(),
    previousVersionId: z.string().optional(),
    error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-move",
  description: "Move multiple pages to a new parent location (max 10). Shows each page name and target location for confirmation. Restructuring the site tree is hard to undo — review carefully. Note: previousVersionId in results is for content rollback only and cannot undo a move.",
  inputSchema,
  outputSchema,
  slices: ["move"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ ids, targetParentId }, extra) => {
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult(validationError as BulkOperationOutput);

    const items = await fetchBulkItemDetails(ids);
    if (items.length === 0) {
      return createToolResult({
        message: "Could not fetch page details",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    let targetName = targetParentId;
    try {
      const targetResult = await chainCms("get-document-by-id", { id: targetParentId });
      if (targetResult.ok) {
        targetName = targetResult.data.variants?.[0]?.name ?? targetParentId;
      }
    } catch {
      // Fall back to showing the ID
    }

    const nameList = items.map(i => `- ${i.name}`).join("\n");
    const message = `Move these ${items.length} pages to '${targetName}'?\n${nameList}`;

    if (!await requestApproval(extra, message)) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    const results = await executeBulkSequentially(items, async (item) => {
      const result = await chainCms("move-document", {
        id: item.id,
        data: { target: { id: targetParentId } },
      });
      if (!result.ok) {
        return result.errorResult;
      }
      return null;
    });

    return createToolResult(buildBulkOutput("Moved", results));
  },
};

export default withStandardDecorators(tool);
