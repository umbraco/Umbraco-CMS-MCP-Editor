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
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to update (max 10)"),
  alias: z.string().describe("The property alias to set (call get-page first to verify it exists on the document type)"),
  value: z.any().describe("The value to set on the property"),
  culture: z.string().optional().describe("The culture code for variant content (omit for invariant properties)"),
  segment: z.string().optional().describe("The segment for segmented content (omit if not using segments)"),
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
  name: "bulk-set-property",
  description: "Set the same property value on multiple pages at once (max 10). Call get-page first to verify the property alias exists. Lists all page names and the property change for confirmation. Each result includes a previousVersionId for rollback.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ ids, alias, value, culture, segment }, extra) => {
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
    const valuePreview = JSON.stringify(value).substring(0, 100);
    const nameList = items.map(i => `- ${i.name}`).join("\n");
    const message = `Set '${alias}' to '${valuePreview}' on these ${items.length} pages?\n${nameList}`;

    // 4. Confirm
    if (!await confirmAction(extra, message, { title: "Confirm bulk set property", defaultValue: true })) {
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
      const result = await mcpClientManager.callTool("cms", "update-document-properties", {
        id: item.id,
        properties: [{ alias, value, culture: culture ?? null, segment: segment ?? null }],
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Property update failed";
      }
      return null;
    });

    // 6. Return summary
    return createToolResult(buildBulkOutput("Updated", results));
  },
};

export default withStandardDecorators(tool);
