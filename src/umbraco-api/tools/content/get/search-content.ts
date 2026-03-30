import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";

const inputSchema = {
  query: z.string().describe("Search term to find content pages"),
  take: z.number().optional().default(10).describe("Number of results to return (default 10)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })).describe("Matching content pages"),
  total: z.number().describe("Total number of matches"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-content",
  description: "Search for content pages by name or text. Returns a list of matching pages with their names and IDs.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ query, take, skip }) => {
    const result = await mcpClientManager.callTool("cms", "search-document", { query, take, skip });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({ items: data.items ?? [], total: data.total ?? 0 });
  },
};

export default withStandardDecorators(tool);
