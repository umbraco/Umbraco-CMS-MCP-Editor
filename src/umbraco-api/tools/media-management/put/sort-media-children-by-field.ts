import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const sortFieldSchema = z.enum(["Name", "CreateDate", "UpdateDate"]);
const sortDirectionSchema = z.enum(["Ascending", "Descending"]);

const inputSchema = {
  parentId: z.string().uuid().optional().describe("The parent media folder ID whose children are being sorted. Omit to sort the items at the media root."),
  field: sortFieldSchema.describe("The field to sort on. Name and CreateDate are the columns the backoffice 'Sort children' dialog exposes; UpdateDate (last edited) is also accepted."),
  direction: sortDirectionSchema.optional().default("Ascending").describe("Sort direction. The backoffice sorts Ascending on the first click of a column header and toggles to Descending on the second."),
};

const outputSchema = z.object({
  message: z.string(),
  field: sortFieldSchema,
  direction: sortDirectionSchema,
  sorted: z.number().describe("Number of child media items now in the sorted order."),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).describe("The children in their new order, mirroring the reordered list the Sort dialog shows after sorting."),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "sort-media-children-by-field",
  description: "Automatically sort the child items of a media folder (or the items at the media root) by name, creation date, or last-edited date — mirrors clicking a column header in the backoffice 'Sort' dialog. Use sort-media-children instead when you need to place specific items at specific positions.",
  inputSchema,
  outputSchema,
  slices: ["sort", "update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ parentId, field, direction }) => {
    // The schema `.default()` is only applied when the MCP transport parses the
    // input; direct handler calls (integration tests) leave it undefined, and
    // Umbraco rejects a missing direction. Resolve it here so both paths agree.
    const resolvedDirection = direction ?? "Ascending";

    const sortResult = parentId
      ? await chainCms("sort-media-children", { id: parentId, data: { field, direction: resolvedDirection } })
      : await chainCms("sort-media-root-children", { field, direction: resolvedDirection });
    if (!sortResult.ok) return sortResult.errorResult;

    // Mirror the dialog's end state: read the children back in their new order.
    const cursor = buildChainedCursor(0, 100);
    const childrenResult = parentId
      ? await chainCms("get-media-children", { parentId, cursor })
      : await chainCms("get-media-root", { cursor });
    if (!childrenResult.ok) return childrenResult.errorResult;

    const items = (childrenResult.data.items ?? []).map((item) => ({
      id: item.id,
      name: item.variants?.[0]?.name ?? "Unknown",
    }));

    return createToolResult({
      message: `Sorted ${items.length} child media item(s) by ${field} (${resolvedDirection})`,
      field,
      direction: resolvedDirection,
      sorted: items.length,
      items,
    });
  },
};

export default withStandardDecorators(tool);
