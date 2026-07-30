import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { blockPropertiesSchema, collectBlockProperties } from "../../helpers/block-inspector.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the Library element to inspect"),
  propertyAlias: z.string().optional().describe("Specific property alias to inspect. If omitted, all block-based properties are shown."),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  blockProperties: blockPropertiesSchema("edit-element-block"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "inspect-element-blocks",
  description: "Inspect the block structure of a Library element. Shows each block's type, unique key, and property values inside the element's BlockList, BlockGrid, or Rich Text properties. Use this to find the propertyAlias and contentKey that edit-element-block needs. Library elements only — for blocks on a content page use inspect-blocks instead. Elements are the document-like reusable content items in the Library section (Umbraco 18).",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, propertyAlias }) => {
    const result = await chainCms("get-element-by-id", { id });
    if (!result.ok) return result.errorResult;
    const element = result.data;

    return createToolResult({
      id: element.id,
      name: element.variants?.[0]?.name ?? "Unknown",
      blockProperties: collectBlockProperties(element.values ?? [], propertyAlias),
    });
  },
};

export default withStandardDecorators(tool);
