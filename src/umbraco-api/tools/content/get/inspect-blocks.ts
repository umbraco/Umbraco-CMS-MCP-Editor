import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { blockPropertiesSchema, collectBlockProperties } from "../../helpers/block-inspector.js";


const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to inspect"),
  propertyAlias: z.string().optional().describe("Specific property alias to inspect. If omitted, all block-based properties are shown."),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  previewUrl: previewUrlSchema,
  blockProperties: blockPropertiesSchema("edit-block"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "inspect-blocks",
  description: "Inspect the block structure of a content page. Shows each block's type, unique key, and property values. Use this to understand how content is structured inside BlockList, BlockGrid, or Rich Text properties before using edit-block to make changes. Content pages only — for blocks on a Library element use inspect-element-blocks instead.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, propertyAlias }) => {
    const result = await chainCms("get-document-by-id", { id });
    if (!result.ok) return result.errorResult;
    const doc = result.data;

    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? "Unknown",
      previewUrl: buildPreviewUrl(doc.id),
      blockProperties: collectBlockProperties(doc.values ?? [], propertyAlias),
    });
  },
};

export default withStandardDecorators(tool);
