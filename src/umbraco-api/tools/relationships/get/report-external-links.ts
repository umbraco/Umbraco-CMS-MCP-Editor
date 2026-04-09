import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";
import { extractLinksFromValues } from "../../helpers/link-extractor.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level pages."),
  take: z.number().optional().default(50).describe("Number of domains to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of domains to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  byDomain: z.array(
    z.object({
      domain: z.string(),
      urls: z.array(
        z.object({
          url: z.string(),
          foundOn: z.array(
            z.object({
              pageId: z.string(),
              pageName: z.string(),
              pageUrl: z.string(),
            })
          ),
        })
      ),
      urlCount: z.number(),
    })
  ).describe("External URLs grouped by domain"),
  totalUrls: z.number().describe("Total number of unique external URLs found"),
  totalDomains: z.number().describe("Total number of unique domains found"),
  scannedPages: z.number().describe("Total number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-external-links",
  description: "Inventory all external URLs across a section of the site, grouped by domain. Useful for auditing third-party dependencies, finding outdated external links, or understanding integration points. Scans up to 100 pages per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    // Map: url -> { domain, pages[] }
    const urlMap = new Map<string, { domain: string; pages: { pageId: string; pageName: string; pageUrl: string }[] }>();

    for (const page of pages) {
      const links = extractLinksFromValues(page.values);

      for (const ext of links.externalUrls) {
        const existing = urlMap.get(ext.url);
        const pageRef = { pageId: page.id, pageName: page.name, pageUrl: page.url };
        if (existing) {
          existing.pages.push(pageRef);
        } else {
          urlMap.set(ext.url, { domain: ext.domain, pages: [pageRef] });
        }
      }
    }

    // Group by domain
    const domainMap = new Map<string, { url: string; foundOn: { pageId: string; pageName: string; pageUrl: string }[] }[]>();

    for (const [url, data] of urlMap.entries()) {
      const existing = domainMap.get(data.domain);
      const entry = { url, foundOn: data.pages };
      if (existing) {
        existing.push(entry);
      } else {
        domainMap.set(data.domain, [entry]);
      }
    }

    // Build output sorted by URL count descending
    const allDomains = Array.from(domainMap.entries())
      .map(([domain, urls]) => ({
        domain,
        urls,
        urlCount: urls.length,
      }))
      .sort((a, b) => b.urlCount - a.urlCount);

    const totalUrls = urlMap.size;
    const totalDomains = allDomains.length;
    const paginated = allDomains.slice(skip, skip + take);

    return createToolResult({
      byDomain: paginated,
      totalUrls,
      totalDomains,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
