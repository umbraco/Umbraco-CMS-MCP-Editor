import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

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
    const searchResult = await mcpClientManager.callTool("cms", "get-collection-media", {
      id: parentId,
      filter: query,
      take,
      skip,
    });
    if (searchResult.isError) return createToolResultError(searchResult);
    const searchData = extractChainedResult(searchResult);

    const items: any[] = searchData.items ?? [];
    const total: number = searchData.total ?? 0;

    if (items.length === 0) {
      return createToolResult({ items: [], total });
    }

    const itemIds: string[] = items.map((item: any) => item.id);

    const urlResult = await mcpClientManager.callTool("cms", "get-media-urls", { id: itemIds });
    if (urlResult.isError) return createToolResultError(urlResult);
    const urlData = extractChainedResult(urlResult);

    return createToolResult({
      items: items.map((item: any) => {
        const urlEntry = (urlData ?? []).find((u: any) => u.id === item.id);
        const url = urlEntry?.urls?.[0] ?? "";
        return {
          id: item.id,
          name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
          mediaType: item.mediaType?.alias ?? item.mediaType ?? "",
          url,
        };
      }),
      total,
    });
  },
};

export default withStandardDecorators(tool);
