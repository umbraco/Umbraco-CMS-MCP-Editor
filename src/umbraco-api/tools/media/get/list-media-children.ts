import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
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
    const cursor = buildChainedCursor(skip, take);
    const result = parentId
      ? await chainCms("get-media-children", { parentId, cursor })
      : await chainCms("get-media-root", { cursor });

    if (!result.ok) return result.errorResult;

    return createToolResult({
      items: (result.data.items ?? []).map((item) => {
        const mediaTypeRaw = item.mediaType as string | { alias?: string; name?: string } | undefined;
        const alias: string = typeof mediaTypeRaw === "string"
          ? mediaTypeRaw
          : (mediaTypeRaw?.alias ?? mediaTypeRaw?.name ?? "");
        const isFolder = (alias || "").toLowerCase().includes("folder");
        return {
          id: item.id,
          name: item.variants?.[0]?.name ?? "Unknown",
          mediaType: alias,
          hasChildren: item.hasChildren ?? false,
          isFolder,
        };
      }),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
