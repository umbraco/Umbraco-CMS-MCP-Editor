import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the dictionary item to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  translations: z.array(
    z.object({
      isoCode: z.string(),
      languageName: z.string(),
      translation: z.string(),
    })
  ).describe("All translations for this dictionary item"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-dictionary",
  description: "Get a dictionary item with all its translations across languages. Shows the key name and each language's translation value.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-dictionary", { id });

    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    const translations = (data.translations ?? []).map((t: any) => ({
      isoCode: t.isoCode ?? t.language?.isoCode ?? "",
      languageName: t.language?.name ?? t.languageName ?? t.isoCode ?? "",
      translation: t.translation ?? "",
    }));

    return createToolResult({
      id: data.id,
      name: data.name ?? "Unknown",
      translations,
    });
  },
};

export default withStandardDecorators(tool);
