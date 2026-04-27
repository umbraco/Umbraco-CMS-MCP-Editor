import { z } from "zod";
import { readFile } from "node:fs/promises";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  filePath: z.string().describe("Local file path of the file to upload"),
  name: z.string().describe("Display name for the media item"),
  parentId: z.string().uuid().optional().describe("ID of the target folder (omit to upload to the root)"),
  mediaTypeName: z.string().optional().describe("Media type name (e.g. 'Image', 'Article', 'Audio', 'Video', 'Vector Graphics', 'File'). Defaults to 'Image'."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "upload-media",
  description: "Upload a file from a local path to the media library. Optionally specify a target folder and media type name (defaults to 'Image').",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ filePath, name, parentId, mediaTypeName }) => {
    let fileAsBase64: string;
    try {
      const buffer = await readFile(filePath);
      fileAsBase64 = buffer.toString("base64");
    } catch (err) {
      return createToolResultError({
        detail: `Failed to read file at "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const createResult = await chainCms("create-media", {
      sourceType: "base64",
      name,
      mediaTypeName: mediaTypeName ?? "Image",
      fileAsBase64,
      ...(parentId ? { parentId } : {}),
    });
    if (!createResult.ok) return createResult.errorResult;

    let location = "the root of the media library";
    if (parentId) {
      const folderResult = await chainCms("get-media-by-id", { id: parentId });
      if (folderResult.ok) {
        location = `"${folderResult.data.variants?.[0]?.name ?? "Unknown"}"`;
      }
    }

    return createToolResult({
      message: `Uploaded "${name}" to ${location}`,
      id: createResult.data.id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
