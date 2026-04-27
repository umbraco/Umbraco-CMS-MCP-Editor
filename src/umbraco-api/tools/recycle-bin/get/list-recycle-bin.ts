import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";
import { chainedTools, itemName } from "../helpers.js";

const inputSchema = {
  type: z.enum(["content", "media"]).describe("Which recycle bin to list: content (pages) or media."),
  parentId: z.string().uuid().optional().describe("When omitted, lists the bin root. When given, lists the children of that trashed folder — the recycle bin is a tree and this drills into nested trashed content."),
  take: z.number().optional().default(20).describe("Number of results to return (default 20)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().optional(),
    hasChildren: z.boolean(),
  })).describe("Trashed items at this level of the recycle bin"),
  total: z.number().describe("Total number of trashed items at this level (before pagination)"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-recycle-bin",
  description: "List items in the content or media recycle bin. Returns one level at a time — when a trashed item has hasChildren=true it is a trashed folder; pass its id as parentId on a follow-up call to drill into its contents. Read-only.",
  inputSchema,
  outputSchema,
  slices: ["list", "tree"],
  annotations: { readOnlyHint: true },
  handler: async ({ type, parentId, take, skip }) => {
    const tools = chainedTools(type);
    const cursor = buildChainedCursor(skip, take);

    const result = parentId
      ? await chainCms(tools.listChildren, { parentId, cursor })
      : await chainCms(tools.listRoot, { cursor });
    if (!result.ok) return result.errorResult;

    return createToolResult({
      items: (result.data.items ?? []).map((item) => {
        const typed = item as { mediaType?: { icon?: string }; documentType?: { icon?: string } };
        const icon = type === "media"
          ? (typed.mediaType?.icon ?? undefined)
          : (typed.documentType?.icon ?? undefined);
        return {
          id: item.id,
          name: itemName(item),
          icon,
          hasChildren: item.hasChildren ?? false,
        };
      }),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
