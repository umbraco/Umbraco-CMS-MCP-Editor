import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition , extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";


const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the page to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.object({ id: z.string() }),
  values: z.array(z.object({ alias: z.string(), value: z.any() }).passthrough()).describe("Content field values"),
  variants: z.array(z.object({ name: z.string() }).passthrough()).describe("Language/culture variants"),
  urls: z.array(z.any()).optional().describe("Published URLs"),
});

/**
 * Check if a value is block-based content and return a summary instead of the raw data.
 */
function summariseIfBlock(value: any): any {
  if (!value || typeof value !== "object") return value;

  // BlockList/BlockGrid
  if (Array.isArray(value.contentData) && Array.isArray(value.settingsData)) {
    return {
      _blockSummary: true,
      blockCount: value.contentData.length,
      hint: "Use inspect-blocks to see block details and edit-block to update block content",
    };
  }

  // RTE with blocks
  if (typeof value.markup === "string" && value.blocks && Array.isArray(value.blocks?.contentData)) {
    const blockCount = value.blocks.contentData.length;
    return {
      _blockSummary: true,
      markup: value.markup,
      blockCount,
      hint: blockCount > 0 ? "Use inspect-blocks to see embedded block details" : undefined,
    };
  }

  return value;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-page",
  description: "Get the full details of a content page including all its fields and values. Non-block properties are returned as-is. Block-based properties (BlockList, BlockGrid, Rich Text) are summarised with a block count — use inspect-blocks to see their full structure. Use this after search-content to see what a page contains.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);
    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? doc.name ?? "Unknown",
      documentType: { id: doc.documentType?.id },
      values: (doc.values ?? []).map((v: any) => ({
        ...v,
        value: summariseIfBlock(v.value),
      })),
      variants: doc.variants ?? [],
      urls: doc.urls ?? [],
    });
  },
};

export default withStandardDecorators(tool);
