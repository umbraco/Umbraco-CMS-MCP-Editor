import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
  description: "Create a new dictionary item with translations. Dictionary keys typically use dot-notation (e.g. 'Header.Title', 'Buttons.ReadMore') — call list-dictionary first to avoid duplicate keys, and use update-dictionary to change translations on an existing item. Use list-languages to find valid ISO codes.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, translations, parentId }) => {
    const result = await chainCms("create-dictionary", {
      name,
      translations,
      parentId,
    });

    if (!result.ok) return result.errorResult;
    return createToolResult({
      message: `Created dictionary item "${name}"`,
      id: result.data.id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
