import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block"),
  propertyAlias: z.string().describe("The document property alias containing the blocks (e.g. 'mainContent'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to edit. Use inspect-blocks to find this."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value for the property"),
  })).describe("Properties to update within the block"),
  blockType: z.enum(["content", "settings"]).optional().describe("Whether to update the block's content or its settings. Defaults to 'content'."),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
  updatedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-block",
  description: "Update properties within a specific block (BlockList, BlockGrid, or Rich Text block). Use inspect-blocks first to find the propertyAlias and contentKey. Pass blockType='settings' to edit a block's settings instead of its content. For non-block page properties, use edit-page instead. For structured property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. Culture/segment applies to the document property level — use separate calls for mixed-variant blocks. Changes are saved but NOT published.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, propertyAlias, contentKey, values, blockType, culture, segment }) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";
    const fieldNames = values.map((v) => v.alias);
    const resolvedBlockType = blockType ?? "content";

    const propsTuple = values.map(v => ({ alias: v.alias, value: v.value })) as [
      { alias: string; value: any }, ...{ alias: string; value: any }[]
    ];
    const updateResult = await chainCms("update-block-property", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      updates: [{
        contentKey,
        blockType: resolvedBlockType,
        properties: propsTuple,
      }],
    });
    if (!updateResult.ok) return updateResult.errorResult;

    const target = resolvedBlockType === "settings" ? "settings" : "content";
    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) in block ${target} on "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      contentKey,
      updatedFields: fieldNames,
    });
  },
};

export default withStandardDecorators(tool);
