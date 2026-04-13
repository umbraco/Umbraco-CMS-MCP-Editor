import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  isoCode: z.string().describe("ISO language code to add (e.g. fr-FR)"),
  name: z.string().optional().describe("Display name for the language (e.g. 'French'). Defaults to the ISO code if not provided."),
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
  name: "create-language",
  description: "Add a new language to the Umbraco site. Use list-languages to see existing languages. You will be asked to confirm before creating.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ isoCode, name: displayName, isDefault, isMandatory, fallbackIsoCode }, extra) => {
    const langName = displayName || isoCode;

    if (!await confirmAction(extra, `Add language "${langName}" (${isoCode}) to the site?`, { title: "Confirm create language" })) {
      return createToolResult({ message: "Create cancelled", isoCode, name: langName });
    }

    const result = await mcpClientManager.callTool("cms", "create-language", { name: langName, isoCode, isDefault, isMandatory, fallbackIsoCode });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      message: `Language "${data.name ?? isoCode}" added successfully`,
      isoCode: data.isoCode ?? isoCode,
      name: data.name ?? isoCode,
    });
  },
};

export default withStandardDecorators(tool);
