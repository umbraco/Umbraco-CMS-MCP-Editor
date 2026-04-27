import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("UUID of the parent dictionary item, or omit to list root-level entries"),
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      translatedLanguages: z.array(z.string()).describe("ISO codes of languages that have a translation value"),
    })
  ).describe("Dictionary items"),
  total: z.number().describe("Total number of items"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-dictionary",
  description: "Browse the dictionary tree. Shows root entries or children of a parent. Each item shows which languages have translations. Use get-dictionary to see the full translations.",
  inputSchema,
  outputSchema,
  slices: ["list", "tree"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const cursor = buildChainedCursor(skip, take);
    const result = parentId
      ? await chainCms("get-dictionary-children", { parentId, cursor })
      : await chainCms("get-dictionary-root", { cursor });

    if (!result.ok) return result.errorResult;

    return createToolResult({
      items: (result.data.items ?? []).map((item) => {
        const translations = ((item as { translations?: { translation?: string; isoCode?: string; language?: { isoCode?: string } }[] }).translations) ?? [];
        const translatedLanguages = translations
          .filter((t) => t.translation != null && t.translation !== "")
          .map((t) => t.isoCode ?? t.language?.isoCode ?? "");
        return {
          id: item.id,
          name: item.name ?? "Unknown",
          translatedLanguages,
        };
      }),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
