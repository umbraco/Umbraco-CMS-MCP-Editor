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
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";
import { checkHumanInTheLoop } from "../../helpers/human-in-the-loop.js";

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
    error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    previouslyPublishedUrls: publishedUrlsSchema.describe("Live URLs this page resolved to BEFORE it was unpublished — now dead. Surface as 'previously at' so the editor knows what just came offline.").optional(),
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
    const gate = checkHumanInTheLoop({ verb: "unpublish" });
    if (gate) return gate;

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
    const message = `Unpublish these ${items.length} pages? They will be taken offline.\n${nameList}`;

    if (!await requestApproval(extra, message)) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // Capture live URLs for every page BEFORE we start unpublishing so the
    // result can surface 'previously at <url>' per row. Doing this up-front
    // (rather than per row alongside the unpublish call) keeps the snapshot
    // aligned with the editor's mental model: "what was live when I asked".
    const previousUrlsById = new Map<string, string[]>();
    for (const item of items) {
      previousUrlsById.set(item.id, await fetchPublishedUrls(item.id));
    }

    const results = await executeBulkSequentially(items, async (item) => {
      const docResult = await chainCms("get-document-by-id", { id: item.id });
      if (!docResult.ok) {
        return docResult.errorResult;
      }
      const cultures = (docResult.data.variants ?? []).filter(v => v.culture).map(v => v.culture as string);

      const result = await chainCms("unpublish-document", {
        id: item.id,
        data: { cultures: cultures.length > 0 ? cultures : null },
      });
      if (!result.ok) {
        return result.errorResult;
      }
      return null;
    });

    for (const row of results) {
      const previous = previousUrlsById.get(row.id) ?? [];
      if (previous.length > 0) {
        row.previouslyPublishedUrls = previous;
      }
    }

    return createToolResult(buildBulkOutput("Unpublished", results));
  },
};

export default withStandardDecorators(tool);
