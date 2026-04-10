import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
  filter: z.string().optional().describe("Filter redirects by URL"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      originalUrl: z.string(),
      destinationUrl: z.string(),
      destinationType: z.enum(["content", "media", "other"]),
      isAutomatic: z.boolean(),
    })
  ).describe("URL redirects"),
  total: z.number().describe("Total number of redirects"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-redirects",
  description: "List URL redirects configured on the site. Optionally filter by URL. Shows the original URL, destination, and whether the redirect was created automatically by Umbraco.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip, filter }) => {
    const result = await mcpClientManager.callTool("cms", "get-all-redirects", { cursor: buildChainedCursor(skip, take), filter });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        originalUrl: item.originalUrl ?? item.url ?? "",
        destinationUrl: item.destinationUrl ?? item.destinationPath ?? "",
        destinationType: (["content", "media"].includes(item.destinationType?.toLowerCase?.())
          ? item.destinationType.toLowerCase()
          : "other") as "content" | "media" | "other",
        isAutomatic: item.isAutomatic ?? false,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
