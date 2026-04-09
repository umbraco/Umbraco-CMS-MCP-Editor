import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { walkContentTree, walkMediaTree } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level items."),
  take: z.number().optional().default(20).describe("Number of top results to return (default 20)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
  type: z.enum(["document", "media", "all"]).optional().default("document").describe("What type of content to scan: document, media, or all (default document)"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      type: z.enum(["document", "media"]),
      documentType: z.string().describe("Document type alias or media type alias"),
      referenceCount: z.number().describe("Number of pages that reference this item"),
    })
  ).describe("Items ranked by inbound reference count, highest first"),
  total: z.number().describe("Total number of items with at least one reference"),
  scannedItems: z.number().describe("Total number of items scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-most-referenced",
  description: "Rank content or media by how many other pages reference them. Surfaces the most critical items — the ones with the biggest impact if changed or deleted. Scans up to 100 items per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip, type }) => {
    const results: { id: string; name: string; url: string; type: "document" | "media"; documentType: string; referenceCount: number }[] = [];

    // Scan documents
    if (type === "document" || type === "all") {
      const pages = await walkContentTree({ parentId, scanLimit: 100 });

      const docResults = await Promise.all(
        pages.map(async (page) => {
          try {
            const refResult = await mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id: page.id });
            if (refResult.isError) return { page, count: 0 };
            const refData = extractChainedResult(refResult);
            const count: number = refData?.total ?? (Array.isArray(refData?.items) ? refData.items.length : 0);
            return { page, count };
          } catch {
            return { page, count: 0 };
          }
        })
      );

      for (const { page, count } of docResults) {
        results.push({
          id: page.id,
          name: page.name,
          url: page.url,
          type: "document",
          documentType: page.documentTypeAlias,
          referenceCount: count,
        });
      }
    }

    // Scan media
    if (type === "media" || type === "all") {
      const mediaItems = await walkMediaTree({ parentId, scanLimit: 100 });

      const mediaResults = await Promise.all(
        mediaItems.map(async (item: any) => {
          try {
            const refResult = await mcpClientManager.callTool("cms", "get-media-by-id-referenced-by", { id: item.id });
            if (refResult.isError) return { item, count: 0 };
            const refData = extractChainedResult(refResult);
            const count: number = refData?.total ?? (Array.isArray(refData?.items) ? refData.items.length : 0);
            return { item, count };
          } catch {
            return { item, count: 0 };
          }
        })
      );

      for (const { item, count } of mediaResults) {
        results.push({
          id: item.id,
          name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
          url: "",
          type: "media",
          documentType: item.mediaType?.alias ?? item.contentTypeAlias ?? "",
          referenceCount: count,
        });
      }
    }

    // Sort by reference count descending, filter to items with at least 1 reference
    const withRefs = results
      .filter((r) => r.referenceCount > 0)
      .sort((a, b) => b.referenceCount - a.referenceCount);

    const paginated = withRefs.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total: withRefs.length,
      scannedItems: results.length,
    });
  },
};

export default withStandardDecorators(tool);
