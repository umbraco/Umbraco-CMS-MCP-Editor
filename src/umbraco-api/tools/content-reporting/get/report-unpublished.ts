import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";

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
      state: z.string(),
      lastModified: z.string(),
    })
  ).describe("Pages that are not in Published state (Draft, NotCreated, etc.)"),
  total: z.number().describe("Total number of unpublished pages found"),
  scannedPages: z.number().describe("Number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-unpublished",
  description: "Find pages that are in draft state or have been unpublished. Useful for identifying content that may have been forgotten or needs review before publishing.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const unpublished = pages
      .filter((page) => page.state !== "Published")
      .map((page) => {
        const variant = page.variants?.[0] ?? {};
        return {
          id: page.id,
          name: page.name,
          url: page.url,
          documentType: page.documentType,
          state: page.state,
          lastModified: variant.updateDate ?? "",
        };
      });

    const total = unpublished.length;
    const paginated = unpublished.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
