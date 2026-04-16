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
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to schedule for publishing (max 10)"),
  publishDate: z.string().datetime().describe("The future date and time to publish the pages, in ISO 8601 format (e.g. 2026-06-01T09:00:00Z). Must be in the future."),
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
  name: "bulk-schedule-publish",
  description: "Schedule multiple pages to publish at a future date (max 10). Provide the date in ISO 8601 format. Lists all page names and the scheduled date for confirmation.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ ids, publishDate }, extra) => {
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

    // 3. Build confirmation listing every name
    const nameList = items.map(i => `- ${i.name}`).join("\n");
    const message = `Schedule these ${items.length} pages to publish on ${publishDate}?\n${nameList}`;

    // 4. Confirm
    if (!await confirmAction(extra, message, { title: "Confirm bulk schedule publish", defaultValue: false })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 5. Execute sequentially
    const results = await executeBulkSequentially(items, async (item) => {
      const result = await mcpClientManager.callTool("cms", "publish-document", {
        id: item.id,
        data: { publishSchedules: [{ culture: null, schedule: { publishTime: publishDate } }] },
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Schedule publish failed";
      }
      return null;
    });

    // 6. Return summary
    return createToolResult(buildBulkOutput("Scheduled", results));
  },
};

export default withStandardDecorators(tool);
