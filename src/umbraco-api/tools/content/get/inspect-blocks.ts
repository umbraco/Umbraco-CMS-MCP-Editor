import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";


const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to inspect"),
  propertyAlias: z.string().optional().describe("Specific property alias to inspect. If omitted, all block-based properties are shown."),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  previewUrl: previewUrlSchema,
  blockProperties: z.array(z.object({
    propertyAlias: z.string().describe("The document property containing these blocks"),
    editorAlias: z.string().optional(),
    blocks: z.array(z.object({
      contentKey: z.string().describe("The block's unique key — use this with edit-block"),
      contentTypeKey: z.string().describe("The block's element type ID"),
      properties: z.array(z.object({
        alias: z.string(),
        value: z.any(),
      })),
    })),
  })),
});

function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

function isRteWithBlocks(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    value.blocks !== null &&
    typeof value.blocks === "object" &&
    Array.isArray(value.blocks?.contentData)
  );
}

function extractBlocks(contentData: any[]): Array<{ contentKey: string; contentTypeKey: string; properties: Array<{ alias: string; value: any }> }> {
  return contentData.map((block: any) => ({
    contentKey: block.key ?? "",
    contentTypeKey: block.contentTypeKey ?? "",
    properties: Array.isArray(block.values)
      ? block.values.map((v: any) => ({ alias: v.alias ?? "", value: v.value }))
      : [],
  }));
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "inspect-blocks",
  description: "Inspect the block structure of a content page. Shows each block's type, unique key, and property values. Use this to understand how content is structured inside BlockList, BlockGrid, or Rich Text properties before using edit-block to make changes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, propertyAlias }) => {
    const result = await chainCms("get-document-by-id", { id });
    if (!result.ok) return result.errorResult;
    const doc = result.data;

    const allValues = doc.values ?? [];

    const filtered = propertyAlias
      ? allValues.filter((v) => v.alias === propertyAlias)
      : allValues;

    const blockProperties = filtered
      .filter((v) => isBlockListOrGridValue(v.value) || isRteWithBlocks(v.value))
      .map((v) => {
        const value = v.value as { contentData?: any[]; blocks?: { contentData?: any[] } };
        if (isRteWithBlocks(value)) {
          return {
            propertyAlias: v.alias,
            editorAlias: "Umbraco.RichText",
            blocks: extractBlocks(value.blocks!.contentData!),
          };
        }
        return {
          propertyAlias: v.alias,
          editorAlias: v.editorAlias ?? undefined,
          blocks: extractBlocks(value.contentData!),
        };
      });

    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? "Unknown",
      previewUrl: buildPreviewUrl(doc.id),
      blockProperties,
    });
  },
};

export default withStandardDecorators(tool);
