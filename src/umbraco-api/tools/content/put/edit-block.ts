import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block"),
  propertyAlias: z.string().describe("The document property alias containing the blocks (e.g. 'mainContent'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to edit. Use inspect-blocks to find this."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value for the property"),
  })).describe("Properties to update within the block"),
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
  description: "Update properties within a specific block (BlockList, BlockGrid, or Rich Text block). Use inspect-blocks first to find the propertyAlias and contentKey. For non-block page properties, use edit-page instead. Culture/segment applies to the document property level — use separate calls for mixed-variant blocks. Changes are saved but NOT published. You will be asked to confirm before updating.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, propertyAlias, contentKey, values, culture, segment }, extra) => {
    // Step 1: Fetch page details for confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation listing field names
    const fieldNames = values.map((v) => v.alias);
    const confirmMessage = `Update ${fieldNames.length} field(s) in block on "${pageName}" (property: ${propertyAlias}): ${fieldNames.join(", ")}? Changes will be saved but not published.`;

    if (!await confirmAction(extra, confirmMessage, { title: "Confirm block edit", defaultValue: true })) {
      return createToolResult({ message: "Edit cancelled", id, name: pageName, contentKey, updatedFields: [] });
    }

    // Step 3: Delegate to update-block-property via dev MCP
    const updateResult = await mcpClientManager.callTool("cms", "update-block-property", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      updates: [{
        contentKey,
        blockType: "content",
        properties: values.map(v => ({ alias: v.alias, value: v.value })),
      }],
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) in block on "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      contentKey,
      updatedFields: fieldNames,
    });
  },
};

export default withStandardDecorators(tool);
