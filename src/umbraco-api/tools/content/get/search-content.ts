import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";


const inputSchema = {
  query: z.string().describe("Search term to find content pages"),
  take: z.number().optional().default(10).describe("Number of results to return (default 10)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })).describe("Matching content pages"),
  total: z.number().describe("Total number of matches"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-content",
  description: "Search for content pages by name or text. Returns a list of matching pages with their names and IDs. Use get-page with an ID from the results to retrieve full page content.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ query, take, skip }) => {
    const result = await chainCms("search-document", { query, cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;
    const data = result.data;
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
