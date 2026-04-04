import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level pages."),
  take: z.number().optional().default(50).describe("Number of results to return after filtering (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  languages: z.array(
    z.object({
      isoCode: z.string(),
      name: z.string(),
    })
  ).describe("All languages configured in the CMS"),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      cultures: z.record(z.string(), z.boolean()).describe("Map of isoCode to whether the page has that culture variant"),
    })
  ).describe("Pages with their translation coverage"),
  summary: z.record(z.string(),
    z.object({
      translated: z.number(),
      missing: z.number(),
      percentage: z.number(),
    })
  ).describe("Per-language translation statistics keyed by isoCode"),
  total: z.number().describe("Total number of pages scanned"),
  scannedPages: z.number().describe("Number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-translation-coverage",
  description: "Translation coverage matrix showing which pages have which language variants. Includes per-language summary statistics. Data maps naturally to a grid/matrix visualisation.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    // Fetch all configured languages
    const langResult = await mcpClientManager.callTool("cms", "get-language", { take: 100, skip: 0 });
    const langData = langResult.isError ? null : extractChainedResult(langResult);
    const languages: { isoCode: string; name: string }[] = (langData?.items ?? []).map((l: any) => ({
      isoCode: l.isoCode ?? l.languageIsoCode ?? "",
      name: l.name ?? l.cultureName ?? l.isoCode ?? "",
    }));

    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    // Build per-page cultures map
    const allItems = pages.map((page) => {
      const presentCultures = new Set<string>(
        (page.variants ?? [])
          .map((v: any) => v.culture ?? v.isoCode ?? "")
          .filter(Boolean)
      );

      const cultures: Record<string, boolean> = {};
      for (const lang of languages) {
        cultures[lang.isoCode] = presentCultures.has(lang.isoCode);
      }

      return {
        id: page.id,
        name: page.name,
        url: page.url,
        cultures,
      };
    });

    // Build per-language summary
    const summary: Record<string, { translated: number; missing: number; percentage: number }> = {};
    for (const lang of languages) {
      const translated = allItems.filter((item) => item.cultures[lang.isoCode] === true).length;
      const missing = allItems.length - translated;
      const percentage = allItems.length > 0 ? Math.round((translated / allItems.length) * 100) : 0;
      summary[lang.isoCode] = { translated, missing, percentage };
    }

    const total = allItems.length;
    const paginated = allItems.slice(skip, skip + take);

    return createToolResult({
      languages,
      items: paginated,
      summary,
      total,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
