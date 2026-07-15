import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  query: z.string().describe("Search term to find Library elements by name"),
  take: z.number().optional().default(10).describe("Number of results to return (default 10)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).describe("Matching Library elements"),
  total: z.number().describe("Total number of matches"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-elements",
  description: "Search for Library elements by name. Returns matching elements with their names and IDs. Use get-element with an ID from the results to retrieve an element's full details. Elements are the document-like reusable content items in the Library section (Umbraco 18).",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ query, take, skip }) => {
    const result = await chainCms("search-element", { query, cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;
    const data = result.data as any;
    const items: any[] = data.items ?? [];
    return createToolResult({
      items: items.map((item) => ({
        id: item.id,
        name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
      })),
      total: data.total ?? items.length,
    });
  },
};

export default withStandardDecorators(tool);
