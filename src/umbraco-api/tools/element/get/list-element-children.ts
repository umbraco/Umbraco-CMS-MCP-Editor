import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Parent folder ID in the Library. Omit to list the root of the Library (top-level folders and elements)."),
  take: z.number().optional().default(20).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    isFolder: z.boolean().describe("True if this node is a folder that organises elements, false if it is an element item"),
    hasChildren: z.boolean(),
  })).describe("Child folders and elements"),
  total: z.number().describe("Total number of children"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-element-children",
  description: "Browse the Library tree — list the folders and elements under a folder, or the Library root when no parentId is given. Elements are the document-like reusable content items in the Library section (Umbraco 18). Use this to navigate the Library, then get-element to see an element's details.",
  inputSchema,
  outputSchema,
  slices: ["tree"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const cursor = buildChainedCursor(skip, take);
    const result = parentId
      ? await chainCms("get-element-children", { parentId, cursor })
      : await chainCms("get-element-root", { cursor });
    if (!result.ok) return result.errorResult;
    const data = result.data as any;
    const items: any[] = data.items ?? [];
    return createToolResult({
      items: items.map((item) => ({
        id: item.id,
        name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
        isFolder: item.isFolder ?? false,
        hasChildren: item.hasChildren ?? false,
      })),
      total: data.total ?? items.length,
    });
  },
};

export default withStandardDecorators(tool);
