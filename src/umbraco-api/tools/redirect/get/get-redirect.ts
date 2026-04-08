import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the redirect to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  originalUrl: z.string(),
  destinationUrl: z.string(),
  destinationType: z.string(),
  isAutomatic: z.boolean(),
  createDate: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-redirect",
  description: "View the full details of a URL redirect including when it was created and whether it was automatic.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-redirect-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      id: data.id ?? id,
      originalUrl: data.originalUrl ?? data.url ?? "",
      destinationUrl: data.destinationUrl ?? data.destinationPath ?? "",
      destinationType: data.destinationType ?? "other",
      isAutomatic: data.isAutomatic ?? false,
      createDate: data.createDate ?? data.createdAt ?? "",
    });
  },
};

export default withStandardDecorators(tool);
