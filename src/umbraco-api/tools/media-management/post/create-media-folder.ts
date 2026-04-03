import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
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
  description: "Create a new folder in the media library. The returned ID can be used as parentId in upload-media or list-media-children. You will be asked to confirm before creating.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, parentId }, extra) => {
    // Step 1: Resolve location for confirmation message
    let location = "at the root";
    if (parentId) {
      const folderResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: parentId });
      if (folderResult.isError) return createToolResultError(folderResult);
      const folder = extractChainedResult(folderResult);
      const parentName = folder.name ?? "Unknown";
      location = `under "${parentName}"`;
    }

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Create folder "${name}" ${location}?`, { title: "Confirm create folder" })) {
      return createToolResult({ message: "Create folder cancelled", id: "", name });
    }

    // Step 3: Delegate to CMS
    const createResult = await mcpClientManager.callTool("cms", "create-media-folder", {
      name,
      parent: parentId ? { id: parentId } : null,
    });
    if (createResult.isError) return createToolResultError(createResult);
    const created = extractChainedResult(createResult);

    return createToolResult({
      message: `Created folder "${name}" ${location}`,
      id: created.id ?? "",
      name,
    });
  },
};

export default withStandardDecorators(tool);
