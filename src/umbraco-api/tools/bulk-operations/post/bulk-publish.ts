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
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to publish (max 10)"),
  includeDescendants: z.boolean().optional().default(false).describe("Whether to also publish all child pages of each page"),
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
  name: "bulk-publish",
  description: "Publish multiple pages at once (max 10). Lists all page names for confirmation. Each result includes a previousVersionId for rollback. Use search-content or list-children to find page IDs first.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ ids, includeDescendants }, extra) => {
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
    const message = `Publish these ${items.length} pages?\n${nameList}`;

    // 4. Confirm
    if (!await confirmAction(extra, message, { title: "Confirm bulk publish", defaultValue: false })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 5. Execute sequentially
    const toolName = includeDescendants ? "publish-document-with-descendants" : "publish-document";
    const results = await executeBulkSequentially(items, async (item) => {
      const result = await mcpClientManager.callTool("cms", toolName, {
        id: item.id,
        data: { publishSchedules: [] },
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Publish failed";
      }
      return null;
    });

    // 6. Return summary
    return createToolResult(buildBulkOutput("Published", results));
  },
};

export default withStandardDecorators(tool);
