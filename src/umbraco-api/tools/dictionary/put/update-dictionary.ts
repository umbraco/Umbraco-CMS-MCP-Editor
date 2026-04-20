import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the dictionary item to update"),
  translations: z.array(
    z.object({
      isoCode: z.string().describe("ISO language code (e.g. en-US)"),
      translation: z.string().describe("The translated text value"),
    })
  ).describe("Translations to update. Languages not listed here will keep their existing translations."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedLanguages: z.array(z.string()).describe("ISO codes of languages that were updated"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "update-dictionary",
  description: "Update translations for a dictionary item. Call get-dictionary first to see existing translations. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, translations }, extra) => {
    // Fetch existing item to get name and current translations
    const existingResult = await mcpClientManager.callTool("cms", "get-dictionary", { id });
    if (existingResult.isError) return createToolResultError(existingResult);
    const existing = extractChainedResult(existingResult);

    const name: string = existing.name ?? "Unknown";
    const existingTranslations: any[] = existing.translations ?? [];

    // Merge: keep existing translations, replacing any that are in the update set
    const updateMap = new Map(translations.map((t) => [t.isoCode, t.translation]));
    const mergedTranslations = existingTranslations.map((t: any) => {
      const isoCode = t.isoCode ?? t.language?.isoCode ?? "";
      return updateMap.has(isoCode)
        ? { isoCode, translation: updateMap.get(isoCode) }
        : { isoCode, translation: t.translation ?? "" };
    });
    // Add any new ISO codes not already in existing
    for (const [isoCode, translation] of updateMap) {
      if (!existingTranslations.some((t: any) => (t.isoCode ?? t.language?.isoCode) === isoCode)) {
        mergedTranslations.push({ isoCode, translation });
      }
    }

    if (!await confirmAction(extra, `Update translations for "${name}"?`, { title: "Confirm update dictionary" })) {
      return createToolResult({ message: "Update cancelled", id, name, updatedLanguages: [] });
    }

    const updateResult = await mcpClientManager.callTool("cms", "update-dictionary-item", {
      id,
      data: { name, translations: mergedTranslations },
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated translations for "${name}"`,
      id,
      name,
      updatedLanguages: translations.map((t) => t.isoCode),
    });
  },
};

export default withStandardDecorators(tool);
