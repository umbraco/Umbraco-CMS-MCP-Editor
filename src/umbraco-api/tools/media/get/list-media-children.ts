import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("UUID of the parent folder, or omit to list root-level items"),
  take: z.number().optional().default(20).describe("Number of results to return (default 20)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string(),
      hasChildren: z.boolean(),
      isFolder: z.boolean(),
    })
  ).describe("Media items and folders"),
  total: z.number().describe("Total number of items"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-media-children",
  description: "List items and folders in the media library under a parent, or root-level items if no parent specified. Use this to navigate the media tree.",
  inputSchema,
  outputSchema,
  slices: ["tree"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const result = parentId
      ? await mcpClientManager.callTool("cms", "get-media-children", { parentId, cursor: buildChainedCursor(skip, take) })
      : await mcpClientManager.callTool("cms", "get-media-root", { cursor: buildChainedCursor(skip, take) });

    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      items: (data.items ?? []).map((item: any) => {
        const alias: string = typeof item.mediaType === "string"
          ? item.mediaType
          : (item.mediaType?.alias ?? item.mediaType?.name ?? "");
        const isFolder = (alias || "").toLowerCase().includes("folder");
        return {
          id: item.id,
          name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
          mediaType: alias,
          hasChildren: item.hasChildren ?? false,
          isFolder,
        };
      }),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
