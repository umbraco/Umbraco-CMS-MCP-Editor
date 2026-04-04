import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  name: z.string().describe("The dictionary key name"),
  translations: z.array(
    z.object({
      isoCode: z.string().describe("ISO language code (e.g. en-US)"),
      translation: z.string().describe("The translated text value"),
    })
  ).describe("Translations to set for this dictionary item"),
  parentId: z.string().uuid().optional().describe("UUID of the parent dictionary item, or omit to create at the root"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-dictionary",
  description: "Create a new dictionary item with translations. Dictionary items are key-value pairs used for UI labels and static text. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, translations, parentId }, extra) => {
    if (!await confirmAction(extra, `Create dictionary item "${name}" with ${translations.length} translation(s)?`, { title: "Confirm create dictionary item" })) {
      return createToolResult({ message: "Create cancelled", id: "", name });
    }

    const result = await mcpClientManager.callTool("cms", "create-dictionary", {
      name,
      translations,
      parent: parentId ? { id: parentId } : null,
    });

    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      message: `Created dictionary item "${name}"`,
      id: data.id ?? "",
      name,
    });
  },
};

export default withStandardDecorators(tool);
