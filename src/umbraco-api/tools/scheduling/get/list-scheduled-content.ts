import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";
import { mcpClientManager } from "../../../mcp-client.js";

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
      scheduledPublishDate: z.string().nullable(),
      scheduledUnpublishDate: z.string().nullable(),
      culture: z.string().nullable(),
    })
  ).describe("Pages with pending scheduled publish or unpublish dates"),
  total: z.number().describe("Total number of scheduled entries found"),
  scannedPages: z.number().describe("Number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-scheduled-content",
  description: "Find pages with pending scheduled publish or unpublish dates. Scans direct children of a parent (or root). Use parentId to check specific sections of the site.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const scheduledItems: Array<{
      id: string;
      name: string;
      url: string;
      scheduledPublishDate: string | null;
      scheduledUnpublishDate: string | null;
      culture: string | null;
    }> = [];

    await Promise.all(
      pages.map(async (page) => {
        const publishResult = await mcpClientManager.callTool("cms", "get-document-publish", { id: page.id });

        // 404 (isError) means unpublished — skip silently
        if (publishResult.isError) return;

        const publishData = extractChainedResult(publishResult);
        const variants: any[] = publishData?.variants ?? [];

        for (const variant of variants) {
          const scheduledPublishDate: string | null = variant.scheduledPublishDate ?? null;
          const scheduledUnpublishDate: string | null = variant.scheduledUnpublishDate ?? null;

          if (scheduledPublishDate !== null || scheduledUnpublishDate !== null) {
            scheduledItems.push({
              id: page.id,
              name: page.name,
              url: page.url,
              scheduledPublishDate,
              scheduledUnpublishDate,
              culture: variant.culture ?? null,
            });
          }
        }
      })
    );

    const total = scheduledItems.length;
    const paginated = scheduledItems.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
