import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPrimaryPublishedUrlsBatch } from "../../helpers/preview-url.js";

// #306: siblings used to be walked strictly serially (await the recursive
// subtree call for one child before moving to the next), so total run time
// summed every Umbraco round trip across the whole tree — seen in prod up to
// 256s. Sibling subtrees are now fanned out with a plain Promise.all, while
// the actual CMS calls (fetchTreeLevel, the per-level URL batch lookup) are
// gated through a single shared ConcurrencyLimiter threaded through the
// whole recursion — so the total number of in-flight CMS calls across the
// entire traversal is bounded at MAX_CONCURRENT_CMS_CALLS, regardless of
// tree depth or width. Plus a wall-clock/node budget so a pathological tree
// returns a partial, clearly-marked result instead of running unbounded.
const MAX_CONCURRENT_CMS_CALLS = 5;
const DEFAULT_NODE_BUDGET = 500;
const DEFAULT_TIME_BUDGET_MS = 20_000;

// Overridable only via the test-only setter below, so truncation can be
// exercised deterministically with a handful of real pages instead of
// requiring 500 of them. Never set these from tool input — they're an
// internal safety valve, not a per-call parameter.
let nodeBudgetOverride: number | null = null;
let timeBudgetMsOverride: number | null = null;

/**
 * @internal Test-only helper. Overrides the node/time traversal budget so
 * truncation can be exercised with a small number of real pages. Do NOT call
 * from production code.
 */
export function _setTraversalBudgetForTests(overrides: { nodeBudget?: number; timeBudgetMs?: number }): void {
  if (overrides.nodeBudget !== undefined) nodeBudgetOverride = overrides.nodeBudget;
  if (overrides.timeBudgetMs !== undefined) timeBudgetMsOverride = overrides.timeBudgetMs;
}

/**
 * @internal Test-only helper. Resets the budget override so other tests see
 * production defaults. Do NOT call from production code.
 */
export function _resetTraversalBudgetForTests(): void {
  nodeBudgetOverride = null;
  timeBudgetMsOverride = null;
}

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to start from root."),
  maxDepth: z.number().optional().default(5).describe("How many levels deep to scan (default 5)"),
  includeUrls: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Look up each page's published URL (default true). Set to false to skip the per-level URL lookup and speed up large trees — every node's `url` will be \"\"."
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
      "True when the scan hit its node or time budget before the whole requested tree was walked, so `tree` is a partial result. Narrow a truncated request with `parentId` to scope to a smaller subtree, lower `maxDepth`, or set `includeUrls: false` to skip URL lookups."
    ),
});

interface TraversalBudget {
  maxNodes: number;
  deadlineMs: number;
  truncated: boolean;
}

// Side-effecting on purpose: this is the single decision point for "has the
// traversal run out of room", so every call site that checks the budget
// also correctly flags the output as truncated, including the recursion
// call site where an `&&` short-circuit previously skipped setting the flag
// (see #306 finding 1 — a tree could come back silently incomplete with
// `truncated: false`).
function isBudgetExceeded(budget: TraversalBudget, totalRef: { count: number }): boolean {
  const exceeded = totalRef.count >= budget.maxNodes || Date.now() >= budget.deadlineMs;
  if (exceeded) budget.truncated = true;
  return exceeded;
}

/**
 * Bounds the number of CMS calls in flight at once, across the whole
 * traversal (not per recursion frame — see #306 finding 2). Callers await
 * `run(fn)`; if the limiter is already at capacity, the call queues until a
 * slot frees up.
 */
class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      // Slot is handed directly to this waiter by the releaser below —
      // don't increment here, it's already been incremented on our behalf.
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) {
        next(); // hand our slot straight to the next waiter — active stays the same
      } else {
        this.active--; // no one waiting, actually free the slot
      }
    }
  }
}

async function fetchTreeLevel(parentId: string | undefined, depth: number): Promise<{ items: any[]; failed: boolean }> {
  const result = parentId
    ? await chainCms("get-document-children", { parentId, cursor: encodeCursor({ s: 0, t: 100 }) })
    : await chainCms("get-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) });

  if (!result.ok) {
    console.warn(`report-site-tree-summary: failed to fetch children of ${parentId ?? "<root>"} at depth ${depth}`);
    return { items: [], failed: true };
  }
  return { items: result.data?.items ?? [], failed: false };
}

async function buildTreeNodes(
  parentId: string | undefined,
  depth: number,
  maxDepth: number,
  includeUrls: boolean,
  pagesPerLevel: Record<string, number>,
  totalRef: { count: number },
  maxDepthRef: { value: number },
  budget: TraversalBudget,
  limiter: ConcurrencyLimiter,
): Promise<TreeNode[]> {
  if (isBudgetExceeded(budget, totalRef)) {
    return [];
  }

  const { items, failed } = await limiter.run(() => fetchTreeLevel(parentId, depth));
  if (failed) {
    budget.truncated = true;
  }

  // One get-document-urls request per tree level fetched — never per item —
  // and skippable entirely via includeUrls:false for large/slow trees.
  const urlsById = includeUrls
    ? await limiter.run(() =>
        fetchPrimaryPublishedUrlsBatch(
          items.map((item) => item.id).filter((id): id is string => typeof id === "string"),
        ),
      )
    : new Map<string, string>();

  // First pass: sequentially (no await in this loop) decide how many items
  // at this level fit inside the remaining node budget, and record their
  // per-level stats. Keeping this part synchronous makes totalPages /
  // pagesPerLevel deterministic regardless of how child subtrees below are
  // later fetched in parallel.
  const included: typeof items = [];
  for (const item of items) {
    if (isBudgetExceeded(budget, totalRef)) {
      break;
    }
    totalRef.count++;
    const levelKey = String(depth);
    pagesPerLevel[levelKey] = (pagesPerLevel[levelKey] ?? 0) + 1;
    if (depth > maxDepthRef.value) {
      maxDepthRef.value = depth;
    }
    included.push(item);
  }

  // Second pass: fetch each included item's subtree. Sibling fan-out is a
  // plain Promise.all — the real throttling happens inside each recursive
  // call, at the limiter.run() call sites above, which bound total in-flight
  // CMS calls across the whole traversal rather than per recursion frame
  // (#306 finding 2).
  const childrenByIndex = await Promise.all(
    included.map((item) => {
      if (item.hasChildren && depth < maxDepth && !isBudgetExceeded(budget, totalRef)) {
        return buildTreeNodes(
          item.id,
          depth + 1,
          maxDepth,
          includeUrls,
          pagesPerLevel,
          totalRef,
          maxDepthRef,
          budget,
          limiter,
        );
      }
      return Promise.resolve([] as TreeNode[]);
    }),
  );

  return included.map((item, i) => {
    const children = childrenByIndex[i];
    return {
      id: item.id ?? "",
      name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
      url: urlsById.get(item.id) ?? "",
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
    "Full site tree structure with page counts per level. Returns hierarchical data that maps to tree diagrams, sitemaps, and flowcharts. Use maxDepth to limit how deep to scan. On a large site the scan stops early once it hits an internal time/node budget and returns `truncated: true` with a partial tree — if you see that, narrow the request with `parentId` to scope to a smaller subtree, lower `maxDepth`, or set `includeUrls: false` to skip URL lookups.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  // `includeUrls = true` is a belt-and-suspenders JS default alongside the
  // zod `.default(true)` above: zod's default only applies when input goes
  // through schema parsing (the real MCP transport path) — a test or any
  // other caller that invokes `.handler()` directly with `includeUrls`
  // omitted would otherwise see `undefined` here and silently skip URL
  // lookups.
  handler: async ({ parentId, maxDepth, includeUrls = true }) => {
    const pagesPerLevel: Record<string, number> = {};
    const totalRef = { count: 0 };
    const maxDepthRef = { value: 0 };
    const budget: TraversalBudget = {
      maxNodes: nodeBudgetOverride ?? DEFAULT_NODE_BUDGET,
      deadlineMs: Date.now() + (timeBudgetMsOverride ?? DEFAULT_TIME_BUDGET_MS),
      truncated: false,
    };

    const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_CMS_CALLS);
    const startDepth = parentId ? 1 : 0;
    const tree = await buildTreeNodes(
      parentId,
      startDepth,
      maxDepth,
      includeUrls,
      pagesPerLevel,
      totalRef,
      maxDepthRef,
      budget,
      limiter,
    );

    return createToolResult({
      tree,
      totalPages: totalRef.count,
      maxDepthFound: maxDepthRef.value,
      pagesPerLevel,
      truncated: budget.truncated,
    });
  },
};

export default withStandardDecorators(tool);
