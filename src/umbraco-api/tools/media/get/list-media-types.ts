import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

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
      ? await mcpClientManager.callTool("cms", "get-media-type-allowed-children", { id: parentId })
      : await mcpClientManager.callTool("cms", "get-media-type-allowed-at-root", {});

    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    const items: any[] = Array.isArray(data) ? data : (data.items ?? []);
    return createToolResult({
      items: items.map((item: any) => ({
        id: item.id,
        alias: item.alias ?? "",
        name: item.name ?? "",
        icon: item.icon ?? "",
      })),
      total: data.total ?? items.length,
    });
  },
};

export default withStandardDecorators(tool);
