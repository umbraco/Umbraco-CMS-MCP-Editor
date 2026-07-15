import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  name: z.string().describe("Name of the new folder"),
  parentId: z.string().uuid().optional().describe("ID of the parent folder in the Library (omit to create at the root)"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-element-folder",
  description: "Create a folder in the Library to organise elements (Umbraco 18 Library section). Folders are the primary way the Library tree is structured; the returned ID can be used as parentId in list-element-children or create-element.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, parentId }) => {
    const createResult = await chainCms("create-element-folder", { name, parent: parentId ? { id: parentId } : null });
    if (!createResult.ok) return createResult.errorResult;

    // create-element-folder returns a bodyless 201 (id in the Location header,
    // not the chained payload), so resolve the new folder's id by finding it by
    // name among the parent's children (or the Library root).
    let createdId: string = (createResult.data as any)?.id ?? "";
    let location = "at the root";
    if (!createdId) {
      const listResult = parentId
        ? await chainCms("get-element-children", { parentId })
        : await chainCms("get-element-root", {});
      if (listResult.ok) {
        const match = ((listResult.data as any).items ?? [])
          .filter((i: any) => i.isFolder)
          .find((i: any) => (i.variants?.[0]?.name ?? i.name) === name);
        if (match) createdId = match.id;
      }
    }
    if (parentId) {
      const folderResult = await chainCms("get-element-folder", { id: parentId });
      if (folderResult.ok) location = `under "${(folderResult.data as any).name ?? "Unknown"}"`;
    }

    return createToolResult({
      message: `Created Library folder "${name}" ${location}`,
      id: createdId,
      name,
    });
  },
};

export default withStandardDecorators(tool);
