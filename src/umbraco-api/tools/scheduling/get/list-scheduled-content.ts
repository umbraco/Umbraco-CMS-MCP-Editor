import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";
import { chainCms } from "../../../cms-chain.js";

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
  description: "Find pages with pending scheduled publish or unpublish dates. Scans up to 100 pages in direct children of a parent (or root). Use parentId to scope to a specific section for larger sites.",
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
        // Use get-document-by-id (draft state) — it carries scheduledPublishDate /
        // scheduledUnpublishDate for both published and never-published pages.
        // get-document-publish 404s for never-published drafts, hiding the most
        // common scheduling case (a draft scheduled for its first publish).
        const docResult = await chainCms("get-document-by-id", { id: page.id });
        if (!docResult.ok) return;

        const variants = docResult.data.variants ?? [];

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
