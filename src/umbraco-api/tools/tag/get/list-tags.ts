import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  tagGroup: z.string().optional().describe("Filter tags by group name, or omit to list all tags"),
  take: z.number().optional().default(50).describe("Number of tags to return"),
  skip: z.number().optional().default(0).describe("Number of tags to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      group: z.string(),
      nodeCount: z.number(),
    })
  ).describe("Tags in use across the site"),
  total: z.number().describe("Total number of tags"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-tags",
  description: "List tags in use across the site. Optionally filter by tag group. Shows how many content items use each tag.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ tagGroup, take, skip }) => {
    const result = await mcpClientManager.callTool("cms", "get-tags", { tagGroup, take, skip });

    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    const items: any[] = Array.isArray(data) ? data : (data.items ?? []);
    return createToolResult({
      items: items.map((item: any) => ({
        id: item.id,
        name: item.text ?? item.name ?? "",
        group: item.group ?? "",
        nodeCount: item.nodeCount ?? 0,
      })),
      total: data.total ?? items.length,
    });
  },
};

export default withStandardDecorators(tool);
