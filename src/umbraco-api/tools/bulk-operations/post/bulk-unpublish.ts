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
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to unpublish (max 10)"),
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
  name: "bulk-unpublish",
  description: "Take multiple pages offline at once (max 10). Pages will remain as drafts. Lists all page names for confirmation. Each result includes a previousVersionId for rollback.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ ids }, extra) => {
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
    const message = `Unpublish these ${items.length} pages? They will be taken offline.\n${nameList}`;

    // 4. Confirm
    if (!await confirmAction(extra, message, { title: "Confirm bulk unpublish", defaultValue: false })) {
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
      // Fetch the document to determine cultures
      const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: item.id });
      if (docResult.isError) {
        return extractChainedResult(docResult)?.detail ?? "Could not fetch document";
      }
      const doc = extractChainedResult(docResult);
      const cultures = (doc.variants ?? []).filter((v: any) => v.culture).map((v: any) => v.culture);

      const result = await mcpClientManager.callTool("cms", "unpublish-document", {
        id: item.id,
        data: { cultures: cultures.length > 0 ? cultures : null },
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Unpublish failed";
      }
      return null;
    });

    // 6. Return summary
    return createToolResult(buildBulkOutput("Unpublished", results));
  },
};

export default withStandardDecorators(tool);
