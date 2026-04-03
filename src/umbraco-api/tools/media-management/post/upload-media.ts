import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  filePath: z.string().describe("Local file path of the file to upload"),
  name: z.string().describe("Display name for the media item"),
  parentId: z.string().uuid().optional().describe("ID of the target folder (omit to upload to the root)"),
  mediaTypeId: z.string().uuid().optional().describe("ID of the media type to use. Call list-media-types first to find a valid ID."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "upload-media",
  description: "Upload a file from a local path to the media library. Optionally specify a target folder. Call list-media-types first to find a valid media type ID. You will be asked to confirm before uploading.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ filePath, name, parentId, mediaTypeId }, extra) => {
    // Step 1: Resolve location for confirmation message
    let location = "the root of the media library";
    if (parentId) {
      const folderResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: parentId });
      if (folderResult.isError) return createToolResultError(folderResult);
      const folder = extractChainedResult(folderResult);
      const folderName = folder.name ?? "Unknown";
      location = `"${folderName}"`;
    }

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Upload "${name}" to ${location}?`, { title: "Confirm upload" })) {
      return createToolResult({ message: "Upload cancelled", id: "", name });
    }

    // Step 3: Delegate to CMS
    const createResult = await mcpClientManager.callTool("cms", "create-media", {
      name,
      parent: parentId ? { id: parentId } : null,
      mediaType: mediaTypeId ? { id: mediaTypeId } : undefined,
      file: filePath,
    });
    if (createResult.isError) return createToolResultError(createResult);
    const created = extractChainedResult(createResult);

    return createToolResult({
      message: `Uploaded "${name}" to ${location}`,
      id: created.id ?? "",
      name,
    });
  },
};

export default withStandardDecorators(tool);
