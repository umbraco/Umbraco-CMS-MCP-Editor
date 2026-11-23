import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPrimaryPublishedUrlsBatch, describeChainError } from "../../helpers/preview-url.js";
import { mapWithConcurrency, Semaphore } from "../../helpers/concurrency.js";

// Real outbound chained-CMS calls are capped at this many in flight at once,
// globally across the whole walk (never one at a time, and never fully
// unbounded) — see https://github.com/umbraco/Umbraco-CMS-MCP-Editor/issues/306.
// Enforced by a single `Semaphore` instance per tool invocation (see
// `WalkBudget.semaphore`), not by `mapWithConcurrency` alone: that helper only
// bounds concurrency within one call, so the recursive call back into
// `buildTreeNodes` for each item's children would otherwise spin up its own
// independent 5-worker pool per recursion level, multiplying the effective
// ceiling to 5^depth.
const CONCURRENCY_LIMIT = 5;

// Stop the walk once either budget is hit and report what was collected so
// far with `truncated: true`, rather than running for minutes on a large
// site. Mirrors the 500-node scan cap `report-deep-pages.ts` already uses,
// plus a wall-clock cap for the pathological case where each round trip is
// individually slow (the 91s/66-call and 256s runs reported in #306).
const DEFAULT_NODE_BUDGET = 500;
const DEFAULT_TIME_BUDGET_MS = 20_000;
let NODE_BUDGET = DEFAULT_NODE_BUDGET;
let TIME_BUDGET_MS = DEFAULT_TIME_BUDGET_MS;

/**
 * @internal Test-only hook to shrink the node/time budget so truncation can
 * be exercised deterministically and fast. Do NOT call from production code.
 */
export function _setBudgetOverridesForTests(overrides: { nodeBudget?: number; timeBudgetMs?: number }): void {
  if (overrides.nodeBudget !== undefined) NODE_BUDGET = overrides.nodeBudget;
  if (overrides.timeBudgetMs !== undefined) TIME_BUDGET_MS = overrides.timeBudgetMs;
}

/** @internal Test-only hook to restore the default budgets after a test overrides them. */
export function _resetBudgetOverridesForTests(): void {
  NODE_BUDGET = DEFAULT_NODE_BUDGET;
  TIME_BUDGET_MS = DEFAULT_TIME_BUDGET_MS;
}

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to start from root."),
  maxDepth: z.number().int().positive().max(10).optional().default(5).describe("How many levels deep to scan (default 5, max 10)"),
  includeUrls: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Resolve each page's published URL (one batched get-document-urls call per level). Set to false to skip URL lookups entirely and scan faster — every node's url is '' when disabled.",
    ),
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
  truncated: z
    .boolean()
    .describe(
      "True when the scan stopped early after hitting its node or time budget, before walking the whole tree/depth. The tree above is a partial result. Narrow the request with parentId (scope to a subtree) and/or a smaller maxDepth to see the rest.",
    ),
});

interface WalkBudget {
  totalRef: { count: number };
  maxDepthRef: { value: number };
  truncatedRef: { value: boolean };
  deadline: number;
  // One instance per tool invocation, shared across every recursion level —
  // see CONCURRENCY_LIMIT's comment for why a per-call mapWithConcurrency
  // pool alone isn't enough.
  semaphore: Semaphore;
}

function budgetExceeded(budget: WalkBudget): boolean {
  return budget.totalRef.count >= NODE_BUDGET || Date.now() >= budget.deadline;
}

async function fetchTreeLevel(parentId: string | undefined, budget: WalkBudget): Promise<any[]> {
  await budget.semaphore.acquire();
  let result;
  try {
    result = parentId
      ? await chainCms("get-document-children", { parentId, cursor: encodeCursor({ s: 0, t: 100 }) })
      : await chainCms("get-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) });
  } finally {
    budget.semaphore.release();
  }

  if (!result.ok) {
    // Indistinguishable from "this node has no children" otherwise — a
    // failed call must not be reported as a complete, empty level.
    console.warn(
      `report-site-tree-summary: fetchTreeLevel failed for parentId ${parentId ?? "<root>"} — ${describeChainError(result.errorResult)}`,
    );
    budget.truncatedRef.value = true;
    return [];
  }

  const data = result.data;
  const items = data?.items ?? [];
  const total = data?.total ?? items.length;
  // The cursor is capped at 100 items per level (see encodeCursor call
  // above); a level with more children than that is itself a partial result,
  // even though this call succeeded.
  if (total > items.length) {
    budget.truncatedRef.value = true;
  }
  return items;
}

async function buildTreeNodes(
  parentId: string | undefined,
  depth: number,
  maxDepth: number,
  pagesPerLevel: Record<string, number>,
  budget: WalkBudget,
  includeUrls: boolean,
): Promise<TreeNode[]> {
  if (budgetExceeded(budget)) {
    budget.truncatedRef.value = true;
    return [];
  }

  const items = await fetchTreeLevel(parentId, budget);

  // One get-document-urls request per parent's children fetched here — never
  // per item — and skipped entirely when the caller doesn't need URLs.
  let urlsById = new Map<string, string>();
  if (includeUrls) {
    await budget.semaphore.acquire();
    try {
      urlsById = await fetchPrimaryPublishedUrlsBatch(
        items.map((item) => item.id).filter((id): id is string => typeof id === "string"),
      );
    } finally {
      budget.semaphore.release();
    }
  }

  // First pass: synchronously (no await in this loop) decide which items at
  // this level fit inside the remaining budget and record their stats. Doing
  // this before any subtree fetch means a truncated level always keeps its
  // first N siblings in tree order, rather than whichever siblings' fetches
  // happened to win the race.
  const included: typeof items = [];
  for (const item of items) {
    if (budgetExceeded(budget)) {
      budget.truncatedRef.value = true;
      break;
    }
    budget.totalRef.count++;
    const levelKey = String(depth);
    pagesPerLevel[levelKey] = (pagesPerLevel[levelKey] ?? 0) + 1;
    if (depth > budget.maxDepthRef.value) {
      budget.maxDepthRef.value = depth;
    }
    included.push(item);
  }

  // Second pass: sibling subtrees fan out with a concurrency cap instead of
  // one at a time (the root cause of #306) and instead of fully unbounded
  // (which would hit the CMS as hard as the tree's widest level).
  return mapWithConcurrency(included, CONCURRENCY_LIMIT, async (item): Promise<TreeNode> => {
    let children: TreeNode[] = [];
    if (item.hasChildren && depth < maxDepth) {
      children = await buildTreeNodes(item.id, depth + 1, maxDepth, pagesPerLevel, budget, includeUrls);
    }

    return {
      id: item.id ?? "",
      name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
      url: includeUrls ? (urlsById.get(item.id) ?? "") : "",
      documentType: item.documentType?.name ?? item.contentTypeName ?? "",
      depth,
      childCount: children.length,
      children,
    };
  });
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-site-tree-summary",
  description:
    "Full site tree structure with page counts per level. Returns hierarchical data that maps to tree diagrams, sitemaps, and flowcharts. Use maxDepth to limit how deep to scan, and includeUrls: false to skip URL lookups for a faster scan. Stops after 500 nodes or 20 seconds on a large site and returns truncated: true — narrow with parentId and/or a smaller maxDepth to cover the rest.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  // `includeUrls = true` backs up the schema's .default(true): a caller that
  // invokes the handler without schema parsing would otherwise get
  // `undefined` here and silently lose every URL.
  handler: async ({ parentId, maxDepth, includeUrls = true }) => {
    const pagesPerLevel: Record<string, number> = {};
    const budget: WalkBudget = {
      totalRef: { count: 0 },
      maxDepthRef: { value: 0 },
      truncatedRef: { value: false },
      deadline: Date.now() + TIME_BUDGET_MS,
      semaphore: new Semaphore(CONCURRENCY_LIMIT),
    };

    const startDepth = parentId ? 1 : 0;
    const tree = await buildTreeNodes(parentId, startDepth, maxDepth, pagesPerLevel, budget, includeUrls);

    return createToolResult({
      tree,
      totalPages: budget.totalRef.count,
      maxDepthFound: budget.maxDepthRef.value,
      pagesPerLevel,
      truncated: budget.truncatedRef.value,
    });
  },
};

export default withStandardDecorators(tool);
