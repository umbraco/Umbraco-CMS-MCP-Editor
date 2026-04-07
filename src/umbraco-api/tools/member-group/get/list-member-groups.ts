import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).describe("Member groups"),
  total: z.number().describe("Total number of member groups"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-member-groups",
  description: "List all member groups. Use group names when creating or updating members to assign them to groups.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const result = await mcpClientManager.callTool("cms", "get-all-member-groups", { take, skip });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.name ?? "",
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
