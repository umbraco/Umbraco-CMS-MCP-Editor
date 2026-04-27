import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
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
    const cursor = buildChainedCursor(skip, take);
    const result = parentId
      ? await chainCms("get-document-children", { parentId, cursor })
      : await chainCms("get-document-root", { cursor });
    if (!result.ok) return result.errorResult;
    return createToolResult({
      items: (result.data.items ?? []).map((item) => ({
        id: item.id,
        name: item.variants[0]?.name ?? "Unknown",
        hasChildren: item.hasChildren,
      })),
      total: result.data.total,
    });
  },
};

export default withStandardDecorators(tool);
