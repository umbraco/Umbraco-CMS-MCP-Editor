import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  query: z.string().describe("Search term to match against dictionary item key names"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ).describe("Matching dictionary items"),
  total: z.number().describe("Total number of matching items"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-dictionary",
  description: "Search for dictionary items by key name. Use get-dictionary to see all translations for a specific item.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ query }) => {
    const result = await chainCms("find-dictionary", { filter: query });

    if (!result.ok) return result.errorResult;
    return createToolResult({
      items: (result.data.items ?? []).map((item) => ({
        id: item.id,
        name: item.name ?? "Unknown",
      })),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
