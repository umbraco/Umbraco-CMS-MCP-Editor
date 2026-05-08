import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const createResult = await chainCms("create-media-folder", { name, parentId });
    if (!createResult.ok) return createResult.errorResult;

    let location = "at the root";
    if (parentId) {
      const folderResult = await chainCms("get-media-by-id", { id: parentId });
      if (folderResult.ok) {
        location = `under "${folderResult.data.variants?.[0]?.name ?? "Unknown"}"`;
      }
    }

    return createToolResult({
      message: `Created folder "${name}" ${location}`,
      id: createResult.data.id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
