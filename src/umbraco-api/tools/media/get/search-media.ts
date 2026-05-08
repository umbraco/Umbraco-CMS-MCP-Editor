import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  query: z.string().describe("Filter term to search for media items by name"),
  parentId: z.string().uuid().optional().describe("Scope search to a specific folder by its UUID"),
  take: z.number().optional().default(10).describe("Number of results to return (default 10)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string(),
      url: z.string(),
    })
  ).describe("Matching media items"),
  total: z.number().describe("Total number of matches"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-media",
  description: "Search for media items by name. Returns matching items with names, types, and URLs. Use get-media for full details. Use list-media-children to browse folders.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ query, parentId, take, skip }) => {
    const searchResult = await chainCms("get-collection-media", {
      id: parentId,
      filter: query,
      cursor: buildChainedCursor(skip, take),
      orderBy: "name",
    });
    if (!searchResult.ok) return searchResult.errorResult;

    const items = searchResult.data.items ?? [];
    const total = searchResult.data.total ?? 0;

    if (items.length === 0) {
      return createToolResult({ items: [], total });
    }

    const itemIds = items.map((item) => item.id);

    const urlResult = await chainCms("get-media-urls", { id: itemIds });
    const urlItems = urlResult.ok ? (urlResult.data.items ?? []) : [];

    return createToolResult({
      items: items.map((item) => {
        const urlEntry = urlItems.find((u) => u.id === item.id);
        const url = urlEntry?.urlInfos?.[0]?.url ?? "";
        return {
          id: item.id,
          name: item.variants?.[0]?.name ?? "Unknown",
          mediaType: item.mediaType?.alias ?? "",
          url,
        };
      }),
      total,
    });
  },
};

export default withStandardDecorators(tool);
