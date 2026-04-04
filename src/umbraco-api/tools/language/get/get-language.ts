import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  isoCode: z.string().describe("ISO language code (e.g. en-US)"),
};

const outputSchema = z.object({
  isoCode: z.string().describe("ISO language code"),
  name: z.string().describe("Display name of the language"),
  isDefault: z.boolean().describe("Whether this is the default language"),
  isMandatory: z.boolean().describe("Whether this language is mandatory"),
  fallbackIsoCode: z.string().nullable().describe("ISO code of the fallback language, if set"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-language",
  description: "Get details of a language by its ISO code. Shows default/mandatory status and fallback language. Use list-languages to see all available ISO codes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ isoCode }) => {
    const result = await mcpClientManager.callTool("cms", "get-language-by-iso-code", { isoCode });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({
      isoCode: data.isoCode,
      name: data.name,
      isDefault: data.isDefault ?? false,
      isMandatory: data.isMandatory ?? false,
      fallbackIsoCode: data.fallbackIsoCode ?? null,
    });
  },
};

export default withStandardDecorators(tool);
