import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to find references for"),
  take: z.number().optional().default(50).describe("Number of references to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of references to skip for pagination"),
};

const outputSchema = z.object({
  total: z.number(),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["document", "documentTypeProperty", "other"]),
    documentType: z.string().optional(),
    published: z.boolean().optional(),
  })).describe("Items that reference this page"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-page-references",
  description: "List all items that reference a content page — e.g. other pages with content pickers, rich-text links, or multi-node-tree-picker values pointing at it. Use before delete-page or move-page to understand impact. Uses the management API's referenced-by index (no tree walk).",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, take, skip }) => {
    const result = await chainCms("get-document-by-id-referenced-by", { id, cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;

    const items = result.data.items.map((item) => {
      if (item.$type === "DocumentReferenceResponseModel") {
        const name = item.variants?.[0]?.name ?? item.name ?? "(unnamed)";
        return {
          id: item.id,
          name,
          kind: "document" as const,
          documentType: item.documentType?.name ?? item.documentType?.alias ?? undefined,
          published: item.published ?? undefined,
        };
      }
      if (item.$type === "DocumentTypePropertyTypeReferenceResponseModel") {
        return { id: item.id, name: item.name ?? "(unnamed)", kind: "documentTypeProperty" as const };
      }
      return { id: item.id, name: item.name ?? "(unnamed)", kind: "other" as const };
    });

    return createToolResult({ total: result.data.total, items });
  },
};

export default withStandardDecorators(tool);
