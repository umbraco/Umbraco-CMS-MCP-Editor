import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
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
    error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
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

    const nameList = items.map(i => `- ${i.name}`).join("\n");
    const message = `Publish these ${items.length} pages?\n${nameList}`;

    if (!await confirmStep(extra, message)) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    const results = await executeBulkSequentially(items, async (item) => {
      // publish-document needs one publishSchedules entry per culture — passing
      // an empty array silently no-ops in Umbraco. Derive from the doc's variants.
      const cultures = item.cultures ?? [null];
      const result = includeDescendants
        ? await chainCms("publish-document-with-descendants", {
            id: item.id,
            data: {
              includeUnpublishedDescendants: false,
              cultures: cultures.filter((c): c is string => c !== null),
            },
          })
        : await chainCms("publish-document", {
            id: item.id,
            data: { publishSchedules: cultures.map((c) => ({ culture: c })) },
          });
      if (!result.ok) {
        return result.errorResult;
      }
      return null;
    });

    return createToolResult(buildBulkOutput("Published", results));
  },
};

export default withStandardDecorators(tool);
