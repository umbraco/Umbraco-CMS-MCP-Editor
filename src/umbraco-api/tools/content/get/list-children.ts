import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition , extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";


const inputSchema = {
  parentId: z.string().uuid().optional().describe("Parent page ID. Omit to get root-level pages."),
  take: z.number().optional().default(20).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), hasChildren: z.boolean() })).describe("Child pages"),
  total: z.number().describe("Total number of children"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-children",
  description: "List content pages in the site tree. Shows child pages under a parent, or root-level pages if no parent is specified. Use this to navigate the site structure.",
  inputSchema,
  outputSchema,
  slices: ["tree"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const toolName = parentId ? "get-document-children" : "get-document-root";
    const args: Record<string, unknown> = { cursor: buildChainedCursor(skip, take) };
    if (parentId) args.parentId = parentId;
    const result = await mcpClientManager.callTool("cms", toolName, args);
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
        hasChildren: item.hasChildren ?? false,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
