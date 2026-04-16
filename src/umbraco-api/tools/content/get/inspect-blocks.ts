import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition , extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";


const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to inspect"),
  propertyAlias: z.string().optional().describe("Specific property alias to inspect. If omitted, all block-based properties are shown."),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  blockProperties: z.array(z.object({
    propertyAlias: z.string().describe("The document property containing these blocks"),
    editorAlias: z.string().optional(),
    blocks: z.array(z.object({
      contentKey: z.string().describe("The block's unique key — use this with edit-block"),
      contentTypeKey: z.string().describe("The block's element type ID"),
      contentTypeAlias: z.string().optional().describe("The block's element type alias (resolved from contentTypeKey when available)"),
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

function extractBlocks(contentData: any[], aliasMap: Map<string, string>): Array<{ contentKey: string; contentTypeKey: string; contentTypeAlias?: string; properties: Array<{ alias: string; value: any }> }> {
  return contentData.map((block: any) => ({
    contentKey: block.key ?? "",
    contentTypeKey: block.contentTypeKey ?? "",
    contentTypeAlias: aliasMap.get(block.contentTypeKey) ?? undefined,
    properties: Array.isArray(block.values)
      ? block.values.map((v: any) => ({ alias: v.alias ?? "", value: v.value }))
      : [],
  }));
}

/** Resolve contentTypeKey UUIDs to aliases via CMS document-type lookups */
async function resolveContentTypeAliases(allValues: Array<{ value: any }>): Promise<Map<string, string>> {
  const aliasMap = new Map<string, string>();
  const keys = new Set<string>();

  for (const v of allValues) {
    const contentData = isBlockListOrGridValue(v.value)
      ? v.value.contentData
      : isRteWithBlocks(v.value)
        ? v.value.blocks.contentData
        : null;
    if (contentData) {
      for (const block of contentData) {
        if (block.contentTypeKey) keys.add(block.contentTypeKey);
      }
    }
  }

  for (const key of keys) {
    try {
      const result = await mcpClientManager.callTool("cms", "get-document-type-by-id", { id: key });
      if (!result.isError) {
        const dt = extractChainedResult(result);
        if (dt?.alias) aliasMap.set(key, dt.alias);
      }
    } catch {
      // Best-effort — leave unmapped
    }
  }

  return aliasMap;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "inspect-blocks",
  description: "Inspect the block structure of a content page. Shows each block's type, unique key, and property values. Use this to understand how content is structured inside BlockList, BlockGrid, or Rich Text properties before using edit-block to make changes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, propertyAlias }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);

    const allValues: Array<{ alias: string; value: any }> = doc.values ?? [];

    const filtered = propertyAlias
      ? allValues.filter((v: any) => v.alias === propertyAlias)
      : allValues;

    const blockValues = filtered.filter((v: any) => isBlockListOrGridValue(v.value) || isRteWithBlocks(v.value));
    const aliasMap = await resolveContentTypeAliases(blockValues);

    const blockProperties = blockValues
      .map((v: any) => {
        if (isRteWithBlocks(v.value)) {
          return {
            propertyAlias: v.alias,
            editorAlias: "Umbraco.RichText",
            blocks: extractBlocks(v.value.blocks.contentData, aliasMap),
          };
        }
        return {
          propertyAlias: v.alias,
          editorAlias: v.editorAlias ?? undefined,
          blocks: extractBlocks(v.value.contentData, aliasMap),
        };
      });

    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? doc.name ?? "Unknown",
      blockProperties,
    });
  },
};

export default withStandardDecorators(tool);
