import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  name: z.string().describe("Name of the new folder"),
  parentId: z.string().uuid().optional().describe("ID of the parent folder (omit to create at the root)"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-media-folder",
  description: "Create a new folder in the media library. The returned ID can be used as parentId in upload-media or list-media-children.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, parentId }) => {
    const createResult = await mcpClientManager.callTool("cms", "create-media-folder", {
      name,
      parent: parentId ? { id: parentId } : null,
    });
    if (createResult.isError) return createToolResultError(createResult);
    const created = extractChainedResult(createResult);

    let location = "at the root";
    if (parentId) {
      const folderResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: parentId });
      if (!folderResult.isError) {
        const folder = extractChainedResult(folderResult);
        location = `under "${folder.name ?? "Unknown"}"`;
      }
    }

    return createToolResult({
      message: `Created folder "${name}" ${location}`,
      id: created.id ?? "",
      name,
    });
  },
};

export default withStandardDecorators(tool);
