import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level pages."),
  take: z.number().optional().default(50).describe("Number of results to return after filtering (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
      inboundReferenceCount: z.number(),
    })
  ).describe("Pages with no inbound content references from other pages"),
  total: z.number().describe("Total number of orphan pages found"),
  scannedPages: z.number().describe("Total number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-orphan-pages",
  description: "Find pages with no inbound content references from other pages. These orphan pages may be unreachable or forgotten. Scans up to 100 pages per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const results = await Promise.all(
      pages.map(async (page) => {
        try {
          const refResult = await mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id: page.id });
          if (refResult.isError) {
            return { page, inboundReferenceCount: 0 };
          }
          const refData = extractChainedResult(refResult);
          const count: number = refData?.total ?? (Array.isArray(refData?.items) ? refData.items.length : 0);
          return { page, inboundReferenceCount: count };
        } catch {
          return { page, inboundReferenceCount: 0 };
        }
      })
    );

    const orphans = results
      .filter((r) => r.inboundReferenceCount === 0)
      .map((r) => ({
        id: r.page.id,
        name: r.page.name,
        url: r.page.url,
        documentType: r.page.documentType,
        inboundReferenceCount: 0,
      }));

    const total = orphans.length;
    const paginated = orphans.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
