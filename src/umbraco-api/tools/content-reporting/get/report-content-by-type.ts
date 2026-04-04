import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level pages."),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      documentType: z.string(),
      alias: z.string(),
      count: z.number(),
      pages: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          url: z.string(),
        })
      ).describe("Up to 5 example pages of this type"),
    })
  ).describe("Document types sorted by page count descending"),
  totalTypes: z.number().describe("Number of distinct document types found"),
  totalPages: z.number().describe("Total number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-content-by-type",
  description: "Breakdown of content pages by document type. Shows how many pages use each type with example pages. Data maps naturally to pie or bar charts. Scans up to 500 pages.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 500 });

    const typeMap = new Map<string, { alias: string; count: number; pages: { id: string; name: string; url: string }[] }>();

    for (const page of pages) {
      const key = page.documentType || "(unknown)";
      const alias = page.documentTypeAlias || "";
      if (!typeMap.has(key)) {
        typeMap.set(key, { alias, count: 0, pages: [] });
      }
      const entry = typeMap.get(key)!;
      entry.count += 1;
      if (entry.pages.length < 5) {
        entry.pages.push({ id: page.id, name: page.name, url: page.url });
      }
    }

    const items = Array.from(typeMap.entries())
      .map(([documentType, data]) => ({ documentType, ...data }))
      .sort((a, b) => b.count - a.count);

    return createToolResult({
      items,
      totalTypes: items.length,
      totalPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
