import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  culture: z.string().describe("The language ISO code to check for (e.g. 'da-DK'). Pages missing this variant will be returned. Call list-languages to find valid culture codes."),
  parentId: z.string().uuid().optional().describe("Parent page ID to search under. Omit to search root-level pages."),
  take: z.number().optional().default(20).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    availableCultures: z.array(z.string()),
  })).describe("Pages that are missing the specified language variant"),
  total: z.number().describe("Total number of pages missing the variant (before pagination)"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-untranslated",
  description: "Find content pages that are missing a specific language variant. Searches up to 100 pages per call — use parentId to scope to a subtree for larger sites. Use copy-variant to seed translations for found pages. Call list-languages to find valid culture codes.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ culture, parentId, take, skip }) => {
    // Step 1: Fetch a batch of tree items
    const cursor = encodeCursor({ s: 0, t: 100 });
    const treeResult = parentId
      ? await chainCms("get-document-children", { parentId, cursor })
      : await chainCms("get-document-root", { cursor });
    if (!treeResult.ok) return treeResult.errorResult;
    const treeData = treeResult.data;
    const treeItems: any[] = treeData.items ?? [];

    // Step 2: For each item, fetch full document to check variants
    const docResults = await Promise.all(
      treeItems.map(async (item: any) => {
        const docResult = await chainCms("get-document-by-id", { id: item.id });
        if (!docResult.ok) return null;
        const doc = docResult.data;
        return { id: item.id, doc };
      })
    );

    // Step 3: Filter to items that do NOT have the specified culture variant
    const untranslated = docResults
      .filter((entry): entry is { id: string; doc: any } => entry !== null)
      .filter(({ doc }) => {
        const variants: any[] = doc.variants ?? [];
        return !variants.some((v: any) => v.culture === culture);
      })
      .map(({ doc }) => {
        const variants: any[] = doc.variants ?? [];
        return {
          id: doc.id,
          name: variants[0]?.name ?? "Unknown",
          availableCultures: variants.map((v: any) => v.culture).filter(Boolean),
        };
      });

    // Step 4: Apply pagination on the filtered results
    const total = untranslated.length;
    const paged = untranslated.slice(skip, skip + take);

    return createToolResult({ items: paged, total });
  },
};

export default withStandardDecorators(tool);
