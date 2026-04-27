import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("UUID of the parent folder to check allowed child types, or omit to list types allowed at root"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      alias: z.string(),
      name: z.string(),
      icon: z.string(),
    })
  ).describe("Allowed media types"),
  total: z.number().describe("Total number of allowed types"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-media-types",
  description: "List media types allowed in a folder (or at root). Use this before upload-media to find the correct media type. Returns the ID, alias, and name of each type.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId }) => {
    const result = parentId
      ? await chainCms("get-media-type-allowed-children", { id: parentId })
      : await chainCms("get-media-type-allowed-at-root", {});

    if (!result.ok) return result.errorResult;

    return createToolResult({
      items: (result.data.items ?? []).map((item) => ({
        id: item.id,
        alias: (item as { alias?: string }).alias ?? "",
        name: item.name ?? "",
        icon: item.icon ?? "",
      })),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
