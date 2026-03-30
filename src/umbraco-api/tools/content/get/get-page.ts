import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the page to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.string(),
  values: z.array(z.any()).describe("Content field values"),
  variants: z.array(z.any()).describe("Language/culture variants"),
  urls: z.array(z.any()).optional().describe("Published URLs"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-page",
  description: "Get the full details of a content page including all its fields and values. Use this after search-content to see what a page contains.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = result.structuredContent as any;
    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? doc.name ?? "Unknown",
      documentType: doc.documentType?.alias ?? "unknown",
      values: doc.values ?? [],
      variants: doc.variants ?? [],
      urls: doc.urls ?? [],
    });
  },
};

export default withStandardDecorators(tool);
