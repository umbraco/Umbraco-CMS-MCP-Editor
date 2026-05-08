import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("The parent media folder ID. Omit to reorder at the media root."),
  sorting: z.array(z.object({
    id: z.string().uuid().describe("ID of a child media item"),
    sortOrder: z.number().int().describe("Zero-based sort order"),
  })).min(1).describe("The child media items with their new sort orders."),
};

const outputSchema = z.object({
  message: z.string(),
  sorted: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "sort-media-children",
  description: "Reorder child media items under a folder (or at the media root) by specifying their new sortOrder values. Use list-media-children to discover the current order first.",
  inputSchema,
  outputSchema,
  slices: ["sort", "update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ parentId, sorting }) => {
    const result = await chainCms("sort-media", {
      parent: parentId ? { id: parentId } : null,
      sorting,
    });
    if (!result.ok) return result.errorResult;

    return createToolResult({
      message: `Reordered ${sorting.length} child media item(s)`,
      sorted: sorting.length,
    });
  },
};

export default withStandardDecorators(tool);
