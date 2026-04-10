import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    alias: z.string(),
    name: z.string(),
  })).describe("Available member types"),
  total: z.number().describe("Total number of member types"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-member-types",
  description: "List available member types. Use this before create-member to find a valid member type ID.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const result = await mcpClientManager.callTool("cms", "get-member-type-root", { cursor: buildChainedCursor(skip, take) });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        alias: item.alias ?? "",
        name: item.name ?? "",
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
