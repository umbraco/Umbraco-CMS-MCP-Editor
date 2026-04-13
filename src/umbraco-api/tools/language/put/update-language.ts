import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  isoCode: z.string().describe("ISO language code of the language to update (e.g. en-US)"),
  isDefault: z.boolean().optional().describe("Whether this language should be the default"),
  isMandatory: z.boolean().optional().describe("Whether this language should be mandatory"),
  fallbackIsoCode: z.string().optional().describe("ISO code of the fallback language"),
};

const outputSchema = z.object({
  message: z.string(),
  isoCode: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "update-language",
  description: "Update a language's settings (default, mandatory, fallback). You will be asked to confirm before updating.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ isoCode, isDefault, isMandatory, fallbackIsoCode }, extra) => {
    // Step 1: Fetch language details for confirmation
    const langResult = await mcpClientManager.callTool("cms", "get-language-by-iso-code", { isoCode });
    if (langResult.isError) return createToolResultError(langResult);
    const lang = extractChainedResult(langResult);
    const name = lang.name ?? isoCode;

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Update settings for "${name}" (${isoCode})?`, { title: "Confirm update language" })) {
      return createToolResult({ message: "Update cancelled", isoCode, name });
    }

    // Step 3: Perform update
    const result = await mcpClientManager.callTool("cms", "update-language", { isoCode, data: { isDefault, isMandatory, fallbackIsoCode } });
    if (result.isError) return createToolResultError(result);

    return createToolResult({
      message: `Language "${name}" (${isoCode}) updated successfully`,
      isoCode,
      name,
    });
  },
};

export default withStandardDecorators(tool);
