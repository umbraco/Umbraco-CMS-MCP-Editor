import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";

const inputSchema = {
  daysSinceUpdate: z.number().optional().default(180).describe("Number of days without an update before a page is considered stale (default 180)"),
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
      daysSinceUpdate: z.number(),
    })
  ).describe("Pages not updated within the threshold, sorted stalest first"),
  total: z.number().describe("Total number of stale pages found"),
  scannedPages: z.number().describe("Number of pages scanned"),
  threshold: z.number().describe("The days-since-update threshold used for this scan"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-stale-content",
  description: "Find pages not updated within a given number of days. Default threshold is 180 days. Returns pages sorted by staleness. Use with analytics data to find high-traffic stale pages.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ daysSinceUpdate, parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const now = Date.now();

    const staleItems = pages
      .map((page) => {
        const variant = page.variants?.[0] ?? {};
        const updateDate: string = variant.updateDate ?? "";
        const lastModifiedMs = updateDate ? new Date(updateDate).getTime() : 0;
        const days = lastModifiedMs > 0 ? Math.floor((now - lastModifiedMs) / (1000 * 60 * 60 * 24)) : Infinity;
        return {
          id: page.id,
          name: page.name,
          url: page.url,
          documentType: page.documentType,
          lastModified: updateDate,
          daysSinceUpdate: isFinite(days) ? days : -1,
        };
      })
      .filter((item) => item.daysSinceUpdate === -1 || item.daysSinceUpdate >= daysSinceUpdate)
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    const total = staleItems.length;
    const paginated = staleItems.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: pages.length,
      threshold: daysSinceUpdate,
    });
  },
};

export default withStandardDecorators(tool);
