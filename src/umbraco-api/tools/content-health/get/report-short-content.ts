import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree, countWords, extractTextContent } from "../../helpers/tree-walker.js";

const inputSchema = {
  minWordCount: z.number().optional().default(100).describe("Minimum word count threshold. Pages below this are flagged (default 100)"),
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
      wordCount: z.number(),
      lastModified: z.string(),
    })
  ).describe("Pages with word count below the threshold"),
  total: z.number().describe("Total number of pages below the word count threshold"),
  scannedPages: z.number().describe("Number of pages scanned"),
  threshold: z.number().describe("The word count threshold used for this scan"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-short-content",
  description: "Find pages with thin content below a word count threshold. Default threshold is 100 words. Use parentId to scope to a subtree. Scans up to 100 pages per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ minWordCount, parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const belowThreshold = pages
      .map((page) => {
        const wordCount = countWords(extractTextContent(page.values));
        const variant = page.variants?.[0] ?? {};
        return {
          id: page.id,
          name: page.name,
          url: page.url,
          documentType: page.documentType,
          wordCount,
          lastModified: variant.updateDate ?? "",
        };
      })
      .filter((item) => item.wordCount < minWordCount);

    const total = belowThreshold.length;
    const paginated = belowThreshold.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: pages.length,
      threshold: minWordCount,
    });
  },
};

export default withStandardDecorators(tool);
