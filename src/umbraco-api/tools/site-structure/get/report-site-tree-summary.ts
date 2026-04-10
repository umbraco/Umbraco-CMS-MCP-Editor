import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to start from root."),
  maxDepth: z.number().optional().default(5).describe("How many levels deep to scan (default 5)"),
};

interface TreeNode {
  id: string;
  name: string;
  url: string;
  documentType: string;
  depth: number;
  childCount: number;
  children: TreeNode[];
}

const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    documentType: z.string(),
    depth: z.number(),
    childCount: z.number(),
    children: z.array(treeNodeSchema),
  })
);

const outputSchema = z.object({
  tree: z.array(treeNodeSchema).describe("Hierarchical site tree with children nested inside each node"),
  totalPages: z.number().describe("Total number of pages found across all levels"),
  maxDepthFound: z.number().describe("The deepest level actually found during the scan"),
  pagesPerLevel: z.record(z.string(), z.number()).describe("Number of pages at each depth level, keyed by depth number as string"),
});

async function fetchTreeLevel(parentId: string | undefined, depth: number): Promise<any[]> {
  const result = parentId
    ? await mcpClientManager.callTool("cms", "get-tree-document-children", { parentId, cursor: encodeCursor({ s: 0, t: 100 }) })
    : await mcpClientManager.callTool("cms", "get-tree-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) });

  if (result.isError) return [];
  const data = extractChainedResult(result);
  return data?.items ?? [];
}

async function buildTreeNodes(
  parentId: string | undefined,
  depth: number,
  maxDepth: number,
  pagesPerLevel: Record<string, number>,
  totalRef: { count: number },
  maxDepthRef: { value: number },
): Promise<TreeNode[]> {
  const items = await fetchTreeLevel(parentId, depth);

  const nodes: TreeNode[] = [];

  for (const item of items) {
    totalRef.count++;
    const levelKey = String(depth);
    pagesPerLevel[levelKey] = (pagesPerLevel[levelKey] ?? 0) + 1;
    if (depth > maxDepthRef.value) {
      maxDepthRef.value = depth;
    }

    let children: TreeNode[] = [];
    if (item.hasChildren && depth < maxDepth) {
      children = await buildTreeNodes(item.id, depth + 1, maxDepth, pagesPerLevel, totalRef, maxDepthRef);
    }

    nodes.push({
      id: item.id ?? "",
      name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
      url: item.url ?? item.urls?.[0]?.url ?? "",
      documentType: item.documentType?.name ?? item.contentTypeName ?? "",
      depth,
      childCount: children.length,
      children,
    });
  }

  return nodes;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-site-tree-summary",
  description: "Full site tree structure with page counts per level. Returns hierarchical data that maps to tree diagrams, sitemaps, and flowcharts. Use maxDepth to limit how deep to scan.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, maxDepth }) => {
    const pagesPerLevel: Record<string, number> = {};
    const totalRef = { count: 0 };
    const maxDepthRef = { value: 0 };

    const startDepth = parentId ? 1 : 0;
    const tree = await buildTreeNodes(parentId, startDepth, maxDepth, pagesPerLevel, totalRef, maxDepthRef);

    return createToolResult({
      tree,
      totalPages: totalRef.count,
      maxDepthFound: maxDepthRef.value,
      pagesPerLevel,
    });
  },
};

export default withStandardDecorators(tool);
