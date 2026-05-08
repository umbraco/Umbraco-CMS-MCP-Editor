import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const result = await chainCms("get-dictionary", { id });

    if (!result.ok) return result.errorResult;
    const data = result.data;

    const translations = (data.translations ?? []).map((t) => {
      const extra = t as { language?: { name?: string; isoCode?: string }; languageName?: string };
      return {
        isoCode: t.isoCode ?? extra.language?.isoCode ?? "",
        languageName: extra.language?.name ?? extra.languageName ?? t.isoCode ?? "",
        translation: t.translation ?? "",
      };
    });

    return createToolResult({
      id: data.id,
      name: data.name ?? "Unknown",
      translations,
    });
  },
};

export default withStandardDecorators(tool);
