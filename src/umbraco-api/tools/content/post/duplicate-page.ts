import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to duplicate"),
  targetParentId: z.string().uuid().optional().describe("Destination parent page ID. Omit to duplicate at the content root."),
  includeDescendants: z.boolean().optional().default(false).describe("Whether to also duplicate all child pages"),
  relateToOriginal: z.boolean().optional().default(false).describe("Record an Umbraco relation linking the copy back to the source page (visible under Info → Relations). Rarely needed for editorial copies — only set true if the user explicitly wants to track which page the copy originated from. Default false."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "duplicate-page",
  description: "Duplicate a content page (and optionally all its descendants) to a new location. The copy is created as a draft named 'Original Name (N)'. By default the new page stands on its own — pass relateToOriginal: true only if the user explicitly wants to record an Umbraco relation linking the copy back to the source. Returns the new page ID for follow-up edits.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, targetParentId, includeDescendants, relateToOriginal }) => {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const sourceName: string = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    const copyResult = await mcpClientManager.callTool("cms", "copy-document", {
      idToCopy: id,
      ...(targetParentId ? { parentId: targetParentId } : {}),
      includeDescendants,
      relateToOriginal,
    });
    if (copyResult.isError) return createToolResultError(copyResult);
    const copy = extractChainedResult(copyResult);

    const destPart = targetParentId ? "" : " at the content root";
    const descPart = includeDescendants ? " with all descendants" : "";
    return createToolResult({
      message: `Duplicated "${sourceName}"${descPart}${destPart}`,
      id: copy.id,
      sourceId: id,
      sourceName,
    });
  },
};

export default withStandardDecorators(tool);
