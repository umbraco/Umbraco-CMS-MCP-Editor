import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import {
  validateBulkIds,
  type BulkItemDetail,
} from "../../helpers/bulk-handler.js";

const inputSchema = {
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to update (max 10)"),
  contentTypeKey: z.string().uuid().describe("The block element type key to target. Use inspect-blocks to find this."),
  propertyAlias: z.string().describe("The document property alias containing the blocks (e.g. 'contentRows'). Use inspect-blocks to find this."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value for the property"),
  })).min(1).describe("Properties to update on every matching block"),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    success: z.boolean(),
    blocksUpdated: z.number(),
    previousVersionId: z.string().optional(),
    error: z.string().optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
  totalBlocksUpdated: z.number(),
});

interface BlockMatch {
  contentKey: string;
}

function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

function isRteWithBlocks(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    value.blocks !== null &&
    typeof value.blocks === "object" &&
    Array.isArray(value.blocks?.contentData)
  );
}

function findMatchingBlocks(doc: any, propertyAlias: string, contentTypeKey: string): BlockMatch[] {
  const allValues: Array<{ alias: string; value: any }> = doc.values ?? [];
  const prop = allValues.find((v: any) => v.alias === propertyAlias);
  if (!prop) return [];

  let contentData: any[] = [];
  if (isBlockListOrGridValue(prop.value)) {
    contentData = prop.value.contentData;
  } else if (isRteWithBlocks(prop.value)) {
    contentData = prop.value.blocks.contentData;
  }

  return contentData
    .filter((block: any) => block.contentTypeKey === contentTypeKey)
    .map((block: any) => ({ contentKey: block.key ?? "" }))
    .filter((b) => b.contentKey !== "");
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-set-block-property",
  description: "Update properties on blocks of a specific type across multiple pages (max 10). Targets all blocks matching the given element type within the specified property. Use inspect-blocks first on a sample page to find contentTypeKey and propertyAlias. Changes are saved but NOT published. You will be asked to confirm before updating.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ ids, contentTypeKey, propertyAlias, values, culture, segment }, extra) => {
    // 1. Validate cap
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult({ ...validationError, totalBlocksUpdated: 0 } as any);

    // 2. Fetch details + find matching blocks per page (single fetch per document)
    const items: BulkItemDetail[] = [];
    const pageBlocks = new Map<string, BlockMatch[]>();

    for (const id of ids) {
      const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
      if (docResult.isError) continue;
      const doc = extractChainedResult(docResult);
      const name = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

      const versionResult = await mcpClientManager.callTool("cms", "get-document-version", {
        documentId: id, take: 1, skip: 0,
      });
      const versionData = versionResult.isError ? null : extractChainedResult(versionResult);
      const currentVersionId = versionData?.items?.[0]?.id ?? "";

      items.push({ id, name, currentVersionId });
      pageBlocks.set(id, findMatchingBlocks(doc, propertyAlias, contentTypeKey));
    }

    if (items.length === 0) {
      return createToolResult({
        message: "Could not fetch page details",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        totalBlocksUpdated: 0,
      });
    }

    const totalBlocks = Array.from(pageBlocks.values()).reduce((sum, blocks) => sum + blocks.length, 0);
    const pagesWithBlocks = items.filter(i => (pageBlocks.get(i.id)?.length ?? 0) > 0);

    // 3. Confirm
    const fieldNames = values.map((v) => v.alias);
    const nameList = items.map(i => {
      const count = pageBlocks.get(i.id)?.length ?? 0;
      return `- ${i.name} (${count} block${count !== 1 ? "s" : ""})`;
    }).join("\n");
    const message = `Update ${fieldNames.length} field(s) on ${totalBlocks} block(s) across ${pagesWithBlocks.length} page(s):\n${nameList}\nFields: ${fieldNames.join(", ")}\nChanges will be saved but not published.`;

    if (!await confirmAction(extra, message, { title: "Confirm bulk block property update", defaultValue: true })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        totalBlocksUpdated: 0,
      });
    }

    // 4. Execute sequentially, fail-fast
    const results: Array<{
      id: string;
      name: string;
      success: boolean;
      blocksUpdated: number;
      previousVersionId?: string;
      error?: string;
    }> = [];
    let stopped = false;
    let totalBlocksUpdated = 0;

    for (const item of items) {
      if (stopped) {
        results.push({
          id: item.id,
          name: item.name,
          success: false,
          blocksUpdated: 0,
          previousVersionId: item.currentVersionId || undefined,
          error: "Skipped — previous item failed",
        });
        continue;
      }

      const blocks = pageBlocks.get(item.id) ?? [];
      if (blocks.length === 0) {
        results.push({
          id: item.id,
          name: item.name,
          success: true,
          blocksUpdated: 0,
          previousVersionId: item.currentVersionId || undefined,
        });
        continue;
      }

      const updateResult = await mcpClientManager.callTool("cms", "update-block-property", {
        documentId: item.id,
        propertyAlias,
        culture: culture ?? null,
        segment: segment ?? null,
        updates: blocks.map(block => ({
          contentKey: block.contentKey,
          blockType: "content",
          properties: values.map(v => ({ alias: v.alias, value: v.value })),
        })),
      });

      if (updateResult.isError) {
        const errorDetail = extractChainedResult(updateResult)?.detail ?? "Block update failed";
        results.push({
          id: item.id,
          name: item.name,
          success: false,
          blocksUpdated: 0,
          previousVersionId: item.currentVersionId || undefined,
          error: typeof errorDetail === "string" ? errorDetail : "Block update failed",
        });
        stopped = true;
      } else {
        totalBlocksUpdated += blocks.length;
        results.push({
          id: item.id,
          name: item.name,
          success: true,
          blocksUpdated: blocks.length,
          previousVersionId: item.currentVersionId || undefined,
        });
      }
    }

    // 5. Return summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success && r.error !== "Skipped — previous item failed").length;
    const skippedCount = results.filter(r => r.error === "Skipped — previous item failed").length;

    return createToolResult({
      message: `Updated ${totalBlocksUpdated} block(s) across ${successCount} of ${results.length} pages`,
      results,
      successCount,
      failureCount,
      skippedCount,
      totalBlocksUpdated,
    });
  },
};

export default withStandardDecorators(tool);
