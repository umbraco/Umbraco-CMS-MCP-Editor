import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

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
    const result = parentId
      ? await mcpClientManager.callTool("cms", "get-dictionary-children", { parentId, take, skip })
      : await mcpClientManager.callTool("cms", "get-dictionary-root", { take, skip });

    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      items: (data.items ?? []).map((item: any) => {
        const translations: any[] = item.translations ?? [];
        const translatedLanguages = translations
          .filter((t: any) => t.translation != null && t.translation !== "")
          .map((t: any) => t.isoCode ?? t.language?.isoCode ?? "");
        return {
          id: item.id,
          name: item.name ?? "Unknown",
          translatedLanguages,
        };
      }),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
