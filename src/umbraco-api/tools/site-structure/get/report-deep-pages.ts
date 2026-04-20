import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  depthThreshold: z.number().optional().default(4).describe("Pages deeper than this level are reported (default 4)"),
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to start from root."),
  take: z.number().optional().default(50).describe("Number of results to return after filtering (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

interface PathEntry {
  id: string;
  name: string;
}

interface DeepPage {
  id: string;
  name: string;
  url: string;
  documentType: string;
  depth: number;
  path: PathEntry[];
}

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
      depth: z.number(),
      path: z.array(z.object({ id: z.string(), name: z.string() })).describe("Breadcrumb path from root to this page"),
    })
  ).describe("Pages that exceed the depth threshold, sorted deepest first"),
  total: z.number().describe("Total number of deep pages found"),
  scannedPages: z.number().describe("Total number of pages scanned during the walk"),
  threshold: z.number().describe("The depth threshold used for this scan"),
});

async function walkForDeepPages(
  parentId: string | undefined,
  depth: number,
  ancestorPath: PathEntry[],
  deepPages: DeepPage[],
  scannedRef: { count: number },
  maxScan: number,
): Promise<void> {
  if (scannedRef.count >= maxScan) return;

  const result = parentId
    ? await mcpClientManager.callTool("cms", "get-document-children", { parentId, cursor: encodeCursor({ s: 0, t: 100 }) })
    : await mcpClientManager.callTool("cms", "get-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) });

  if (result.isError) return;
  const data = extractChainedResult(result);
  const items: any[] = data?.items ?? [];

  for (const item of items) {
    if (scannedRef.count >= maxScan) break;
    scannedRef.count++;

    const name: string = item.name ?? item.variants?.[0]?.name ?? "Unknown";
    const currentPath: PathEntry[] = [...ancestorPath, { id: item.id, name }];

    if (depth > 0) {
      deepPages.push({
        id: item.id ?? "",
        name,
        url: item.url ?? item.urls?.[0]?.url ?? "",
        documentType: item.documentType?.name ?? item.contentTypeName ?? "",
        depth,
        path: currentPath,
      });
    }

    if (item.hasChildren) {
      await walkForDeepPages(item.id, depth + 1, currentPath, deepPages, scannedRef, maxScan);
    }
  }
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-deep-pages",
  description: "Find pages buried more than N levels deep in the site tree. Deep pages are harder for users to find. Default threshold is 4 levels. Includes the full path to each deep page.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ depthThreshold, parentId, take, skip }) => {
    const allDeepPages: DeepPage[] = [];
    const scannedRef = { count: 0 };

    // Walk the full tree and collect ALL pages with depth > depthThreshold
    // Start at depth 1 for root items (depth 0 means root level, we don't include those in deepPages by default)
    // We collect everything and then filter
    const allPages: (DeepPage & { rawDepth: number })[] = [];

    async function walkAll(pid: string | undefined, depth: number, ancestorPath: PathEntry[]): Promise<void> {
      if (scannedRef.count >= 500) return;

      const result = pid
        ? await mcpClientManager.callTool("cms", "get-document-children", { parentId: pid, cursor: encodeCursor({ s: 0, t: 100 }) })
        : await mcpClientManager.callTool("cms", "get-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) });

      if (result.isError) return;
      const data = extractChainedResult(result);
      const items: any[] = data?.items ?? [];

      for (const item of items) {
        if (scannedRef.count >= 500) break;
        scannedRef.count++;

        const name: string = item.name ?? item.variants?.[0]?.name ?? "Unknown";
        const currentPath: PathEntry[] = [...ancestorPath, { id: item.id, name }];

        allPages.push({
          id: item.id ?? "",
          name,
          url: item.url ?? item.urls?.[0]?.url ?? "",
          documentType: item.documentType?.name ?? item.contentTypeName ?? "",
          depth,
          rawDepth: depth,
          path: currentPath,
        });

        if (item.hasChildren) {
          await walkAll(item.id, depth + 1, currentPath);
        }
      }
    }

    const startDepth = parentId ? 1 : 1;
    await walkAll(parentId, startDepth, []);

    const deepPages = allPages
      .filter((p) => p.depth > depthThreshold)
      .sort((a, b) => b.depth - a.depth)
      .map(({ rawDepth: _raw, ...rest }) => rest);

    const total = deepPages.length;
    const paginated = deepPages.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      scannedPages: scannedRef.count,
      threshold: depthThreshold,
    });
  },
};

export default withStandardDecorators(tool);
