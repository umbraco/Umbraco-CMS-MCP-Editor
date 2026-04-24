import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
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
    const args: Record<string, unknown> = { cursor };
    if (parentId) args.parentId = parentId;

    const chainedName = parentId ? tools.listChildren : tools.listRoot;
    const result = await mcpClientManager.callTool("cms", chainedName, args);
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      items: (data.items ?? []).map((item: any) => {
        const icon = type === "media"
          ? (item.mediaType?.icon ?? undefined)
          : (item.documentType?.icon ?? undefined);
        return {
          id: item.id,
          name: itemName(item),
          icon,
          hasChildren: item.hasChildren ?? false,
        };
      }),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
