import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition , extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";


const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })).describe("Available document types"),
  total: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-document-types",
  description: "List available document types that can be used to create new pages. Returns the ID, alias, and name of each type. Use this before create-page to find the correct documentTypeId. Returns up to 50 by default — check total to determine if more exist and use skip to paginate.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-type-root", { take, skip });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        alias: item.alias ?? "unknown",
        name: item.name ?? item.alias ?? "Unknown",
        description: item.description || undefined,
        icon: item.icon || undefined,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
