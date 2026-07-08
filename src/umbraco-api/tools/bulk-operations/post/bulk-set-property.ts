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
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { validateDocumentState, validationResultSchema } from "../../helpers/validate-document.js";

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
    error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    previewUrl: previewUrlSchema.optional(),
    validation: validationResultSchema.optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-set-property",
  description: "Set the same property value on multiple pages at once (max 10). Call get-page first to verify the property alias exists. For non-string non-block property values (media pickers, content/multi-node pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. For block-shaped values use bulk-set-block-property (or the per-page block tools — add-blocklist-block / add-blockgrid-block / add-rte-block / edit-block) instead of hand-constructing the JSON here. Lists all page names and the property change for confirmation. Each successful result includes a previousVersionId for rollback, a previewUrl (draft preview after the change), and a `validation` outcome — if `valid` is false the changes were saved but the page cannot be published until the listed errors are resolved.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ ids, alias, value, culture, segment }, extra) => {
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

    const valuePreview = JSON.stringify(value).substring(0, 100);
    const nameList = items.map(i => `- ${i.name}`).join("\n");
    const message = `Set '${alias}' to '${valuePreview}' on these ${items.length} pages?\n${nameList}`;

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
      const result = await chainCms("update-document-properties", {
        id: item.id,
        properties: [{ alias, value, culture: culture ?? null, segment: segment ?? null }],
      });
      if (!result.ok) {
        return result.errorResult;
      }
      return null;
    });

    // Decorate per-page results that succeeded with the post-save validation
    // outcome and a fresh preview URL. Run sequentially to avoid hammering the
    // backoffice when the bulk size is at the 10-item cap.
    for (const row of results) {
      if (!row.success) continue;
      row.validation = await validateDocumentState(row.id);
      row.previewUrl = await fetchPreviewUrl(row.id);
    }

    return createToolResult(buildBulkOutput("Updated", results));
  },
};

export default withStandardDecorators(tool);
