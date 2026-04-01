import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";

const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the page to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.string(),
  values: z.array(z.object({ alias: z.string(), value: z.any() }).passthrough()).describe("Content field values"),
  variants: z.array(z.object({ name: z.string() }).passthrough()).describe("Language/culture variants"),
  urls: z.array(z.any()).optional().describe("Published URLs"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-page",
  description: "Get the full details of a content page including all its fields and values. Use this after search-content to see what a page contains. Note: responses may be large for pages with many fields or rich content — only call when you need the full field values (e.g. before editing).",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);
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
