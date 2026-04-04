import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";

const inputSchema = {
  daysBack: z.number().optional().default(7).describe("How many days back to look for changes (default 7)"),
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
      lastModified: z.string(),
      daysAgo: z.number(),
    })
  ).describe("Pages modified within the period, sorted most recently changed first"),
  total: z.number().describe("Total number of recently changed pages found"),
  scannedPages: z.number().describe("Number of pages scanned"),
  period: z.number().describe("The look-back period in days used for this scan"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-recently-changed",
  description: "Find pages changed within a recent time period. Default is the last 7 days. Returns pages sorted by most recently changed. Useful for reviewing recent editorial activity.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ daysBack, parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const now = Date.now();
    const cutoffMs = now - daysBack * 24 * 60 * 60 * 1000;

    const recentItems = pages
      .map((page) => {
        const variant = page.variants?.[0] ?? {};
        const updateDate: string = variant.updateDate ?? "";
        const lastModifiedMs = updateDate ? new Date(updateDate).getTime() : 0;
        const daysAgo = lastModifiedMs > 0 ? Math.floor((now - lastModifiedMs) / (1000 * 60 * 60 * 24)) : -1;
        return {
          id: page.id,
          name: page.name,
          url: page.url,
          documentType: page.documentType,
          lastModified: updateDate,
          daysAgo,
          lastModifiedMs,
        };
      })
      .filter((item) => item.lastModifiedMs > 0 && item.lastModifiedMs >= cutoffMs)
      .sort((a, b) => b.lastModifiedMs - a.lastModifiedMs)
      .map(({ lastModifiedMs: _ms, ...rest }) => rest);

    const total = recentItems.length;
    const paginated = recentItems.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: pages.length,
      period: daysBack,
    });
  },
};

export default withStandardDecorators(tool);
