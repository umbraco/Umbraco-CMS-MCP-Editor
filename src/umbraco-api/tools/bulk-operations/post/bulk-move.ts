import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
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
    error: z.string().optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-move",
  description: "Move multiple pages to a new parent location (max 10). Shows each page name and target location for confirmation. Restructuring the site tree is hard to undo — review carefully. Each result includes a previousVersionId for rollback.",
  inputSchema,
  outputSchema,
  slices: ["move"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ ids, targetParentId }, extra) => {
    // 1. Validate cap
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult(validationError as BulkOperationOutput);

    // 2. Fetch details for confirmation + rollback
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

    // 3. Fetch target parent name for the confirmation message
    let targetName = targetParentId;
    try {
      const targetResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: targetParentId });
      if (!targetResult.isError) {
        const targetDoc = extractChainedResult(targetResult);
        targetName = targetDoc.variants?.[0]?.name ?? targetDoc.name ?? targetParentId;
      }
    } catch {
      // Fall back to showing the ID
    }

    // 4. Build confirmation listing every name
    const nameList = items.map(i => `- ${i.name}`).join("\n");
    const message = `Move these ${items.length} pages to '${targetName}'?\n${nameList}`;

    // 5. Confirm
    if (!await confirmAction(extra, message, { title: "Confirm bulk move", defaultValue: false })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 6. Execute sequentially
    const results = await executeBulkSequentially(items, async (item) => {
      const result = await mcpClientManager.callTool("cms", "move-document", {
        id: item.id,
        target: { id: targetParentId },
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Move failed";
      }
      return null;
    });

    // 7. Return summary
    return createToolResult(buildBulkOutput("Moved", results));
  },
};

export default withStandardDecorators(tool);
