import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("The parent page ID whose children are being reordered. Omit to reorder at the content root."),
  sorting: z.array(z.object({
    id: z.string().uuid().describe("ID of a child page"),
    sortOrder: z.number().int().describe("Zero-based sort order"),
  })).min(1).describe("The child pages with their new sort orders. Only include the children that should change order."),
};

const outputSchema = z.object({
  message: z.string(),
  sorted: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "sort-children",
  description: "Reorder child pages under a parent (or at the content root) by specifying their new sortOrder values. Use list-children to discover the current order first.",
  inputSchema,
  outputSchema,
  slices: ["sort", "update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ parentId, sorting }) => {
    const result = await chainCms("sort-document", {
      parent: parentId ? { id: parentId } : null,
      sorting,
    });
    if (!result.ok) return result.errorResult;

    return createToolResult({
      message: `Reordered ${sorting.length} child page(s)`,
      sorted: sorting.length,
    });
  },
};

export default withStandardDecorators(tool);
