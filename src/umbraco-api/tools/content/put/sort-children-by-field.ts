import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";

const sortFieldSchema = z.enum(["Name", "CreateDate", "UpdateDate"]);
const sortDirectionSchema = z.enum(["Ascending", "Descending"]);

const inputSchema = {
  parentId: z.string().uuid().optional().describe("The parent page ID whose children are being sorted. Omit to sort the pages at the content root."),
  field: sortFieldSchema.describe("The field to sort on. Name and CreateDate are the columns the backoffice 'Sort children' dialog exposes; UpdateDate (last edited) is also accepted."),
  direction: sortDirectionSchema.optional().default("Ascending").describe("Sort direction. The backoffice sorts Ascending on the first click of a column header and toggles to Descending on the second."),
  culture: z.string().optional().describe("For culture-variant content, the culture code whose variant names/dates are sorted on. Omit for invariant content."),
};

const outputSchema = z.object({
  message: z.string(),
  field: sortFieldSchema,
  direction: sortDirectionSchema,
  sorted: z.number().describe("Total number of child pages now in the sorted order. The sort applies to every child, not just the ones listed in `items`."),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).describe("The FIRST PAGE of the children in their new order (capped at 100), mirroring the reordered list the Sort dialog shows after sorting. When `sorted` exceeds this list's length the remaining children were still reordered — use list-children to page through them."),
  parentPreviewUrl: previewUrlSchema.describe("Backoffice preview link for the parent page so the editor can confirm the new order. Null when sorting at the content root or when the base URL is not resolvable."),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "sort-children-by-field",
  description: "Automatically sort the child pages of a parent (or the pages at the content root) by name, creation date, or last-edited date — mirrors clicking a column header in the backoffice 'Sort' dialog. Use sort-children instead when you need to place specific pages at specific positions.",
  inputSchema,
  outputSchema,
  slices: ["sort", "update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ parentId, field, direction, culture }) => {
    // The schema `.default()` is only applied when the MCP transport parses the
    // input; direct handler calls (integration tests) leave it undefined, and
    // Umbraco rejects a missing direction. Resolve it here so both paths agree.
    const resolvedDirection = direction ?? "Ascending";

    const sortResult = parentId
      ? await chainCms("sort-document-children", {
          id: parentId,
          data: { field, direction: resolvedDirection, culture: culture ?? null },
        })
      : await chainCms("sort-document-root-children", {
          field,
          direction: resolvedDirection,
          culture: culture ?? null,
        });
    if (!sortResult.ok) return sortResult.errorResult;

    // Mirror the dialog's end state: read the children back in their new order.
    // Only the first page is read back, but the sort above reordered EVERY child
    // server-side — so report the response's `total`, not this page's length.
    const cursor = buildChainedCursor(0, 100);
    const childrenResult = parentId
      ? await chainCms("get-document-children", { parentId, cursor })
      : await chainCms("get-document-root", { cursor });
    if (!childrenResult.ok) return childrenResult.errorResult;

    const items = (childrenResult.data.items ?? []).map((item) => ({
      id: item.id,
      name: item.variants[0]?.name ?? "Unknown",
    }));
    const total = childrenResult.data.total ?? items.length;

    return createToolResult({
      message: `Sorted ${total} child page(s) by ${field} (${resolvedDirection})`,
      field,
      direction: resolvedDirection,
      sorted: total,
      items,
      parentPreviewUrl: parentId ? await fetchPreviewUrl(parentId) : null,
    });
  },
};

export default withStandardDecorators(tool);
