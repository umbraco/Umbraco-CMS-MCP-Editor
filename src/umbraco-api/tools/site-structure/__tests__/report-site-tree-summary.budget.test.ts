/**
 * Unit coverage for report-site-tree-summary's perf fix
 * (Umbraco-CMS-MCP-Editor#306): the global concurrency cap across the whole
 * tree walk, the node/time budget that sets `truncated: true`, the two cases
 * where data can be silently dropped without `truncated: true` (a failed
 * chained call, and a level with more children than the page cap returns),
 * and the `includeUrls` opt-out. None of this is practically provokable
 * against a real Umbraco instance (hitting a 500-node or 20s budget would
 * mean creating hundreds of real pages, and asserting an exact concurrency
 * ceiling needs a controllable, artificially-delayed chained call) — so,
 * following the same `jest.spyOn(mcpClientManager, "callTool")` pattern as
 * `get-document-type.warnings.test.ts` and `cms-chain.test.ts`, this stubs
 * the chained CMS client instead.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { mcpClientManager } from "../../../mcp-client.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import reportSiteTreeSummaryTool, {
  _setBudgetOverridesForTests,
  _resetBudgetOverridesForTests,
} from "../get/report-site-tree-summary.js";

function makeId(n: number): string {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
}

function makeRootItem(id: string, hasChildren: boolean) {
  return {
    id,
    hasChildren,
    name: `Item ${id}`,
    documentType: { name: "Page" },
    variants: [{ name: `Item ${id}` }],
  };
}

describe("report-site-tree-summary — budget and concurrency (#306)", () => {
  let spy: ReturnType<typeof jest.spyOn>;

  afterEach(() => {
    spy.mockRestore();
    _resetBudgetOverridesForTests();
  });

  it("stops at the node budget and reports truncated: true, without overshooting", async () => {
    _setBudgetOverridesForTests({ nodeBudget: 10 });

    const rootItems = Array.from({ length: 20 }, (_, i) => makeRootItem(makeId(i), false));

    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName === "get-document-root") {
          return { isError: false, structuredContent: { total: rootItems.length, items: rootItems }, content: [] };
        }
        if (toolName === "get-document-urls") {
          const ids = (args as { id: string[] }).id ?? [];
          return {
            isError: false,
            structuredContent: { items: ids.map((id) => ({ id, urlInfos: [] })) },
            content: [],
          };
        }
        throw new Error(`unexpected tool call: ${String(toolName)}`);
      },
    );

    const result = await callTool(reportSiteTreeSummaryTool, { maxDepth: 5, includeUrls: true }, {});

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.truncated).toBe(true);
    expect(data.totalPages).toBe(10);
    expect(data.tree).toHaveLength(10);
  });

  it("stops at the time budget and reports truncated: true, after exercising at least one level of real recursion", async () => {
    // Only get-document-children is slow, and the override (10ms) is blown
    // mid-walk by that call — not at function entry — so this proves the
    // budget check inside the recursive call, not just the top-level one.
    // The root level is processed first (totalPages > 0), and the walk stops
    // before reaching anywhere near a full recursion (totalPages well under
    // the 5-item fixture it would otherwise produce).
    _setBudgetOverridesForTests({ timeBudgetMs: 10 });

    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName === "get-document-root") {
          return {
            isError: false,
            structuredContent: { total: 1, items: [makeRootItem(makeId(0), true)] },
            content: [],
          };
        }
        if (toolName === "get-document-children") {
          await new Promise((resolve) => setTimeout(resolve, 30));
          const parentId = (args as { parentId: string }).parentId;
          return {
            isError: false,
            structuredContent: { total: 1, items: [makeRootItem(`${parentId}-child`, true)] },
            content: [],
          };
        }
        if (toolName === "get-document-urls") {
          const ids = (args as { id: string[] }).id ?? [];
          return {
            isError: false,
            structuredContent: { items: ids.map((id) => ({ id, urlInfos: [] })) },
            content: [],
          };
        }
        throw new Error(`unexpected tool call: ${String(toolName)}`);
      },
    );

    const result = await callTool(reportSiteTreeSummaryTool, { maxDepth: 5, includeUrls: true }, {});

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.truncated).toBe(true);
    // The root item was processed (proving get-document-children's mock —
    // representing deeper recursion — was actually reached) before the
    // deadline stopped the walk one level later.
    expect(data.totalPages).toBeGreaterThan(0);
    expect(data.totalPages).toBeLessThan(5);
  });

  it("caps real concurrent chained-CMS calls at exactly 5 across a multi-level, multi-branch walk (not 5 per recursion level)", async () => {
    // Reproduces the shape that previously produced 801 concurrent
    // get-document-children calls against a coded cap of 5: 3 levels deep,
    // width 5 at each level (an ordinary category -> subcategory -> listing
    // shape). Under the old per-call-site mapWithConcurrency bug, each of the
    // 5 depth-0 branches span up its own independent 5-worker pool for its
    // own subtree, and those pools nest again one level down, multiplying
    // the effective ceiling well past 5. The fix must keep the real
    // simultaneous network-call count (get-document-children AND
    // get-document-urls together) at exactly 5, globally, regardless of how
    // many logical branches are "in progress" at once.
    const WIDTH = 5;
    const LEAF_LEVEL = 2;
    const depthById = new Map<string, number>();

    let inFlight = 0;
    let maxInFlight = 0;
    let childrenCalls = 0;

    async function tracked<T>(fn: () => Promise<T>): Promise<T> {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await fn();
      } finally {
        inFlight--;
      }
    }

    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName === "get-document-root") {
          return tracked(async () => {
            const items = Array.from({ length: WIDTH }, (_, i) => {
              const id = makeId(i);
              depthById.set(id, 0);
              return makeRootItem(id, true);
            });
            return { isError: false, structuredContent: { total: items.length, items }, content: [] };
          });
        }
        if (toolName === "get-document-children") {
          return tracked(async () => {
            childrenCalls++;
            const parentId = (args as { parentId: string }).parentId;
            const parentLevel = depthById.get(parentId) ?? 0;
            const childLevel = parentLevel + 1;
            const hasChildren = childLevel < LEAF_LEVEL;
            const items = Array.from({ length: WIDTH }, (_, i) => {
              const id = `${parentId}-${i}`;
              depthById.set(id, childLevel);
              return makeRootItem(id, hasChildren);
            });
            return { isError: false, structuredContent: { total: items.length, items }, content: [] };
          });
        }
        if (toolName === "get-document-urls") {
          return tracked(async () => {
            const ids = (args as { id: string[] }).id ?? [];
            return { isError: false, structuredContent: { items: ids.map((id) => ({ id, urlInfos: [] })) }, content: [] };
          });
        }
        throw new Error(`unexpected tool call: ${String(toolName)}`);
      },
    );

    const result = await callTool(reportSiteTreeSummaryTool, { maxDepth: 5, includeUrls: true }, {});

    expect(result.isError).toBeFalsy();
    // Every level was walked (5 + 25 + 125 = 155 nodes; well under the
    // default 500-node budget), so this isn't just an artifact of early
    // truncation hiding the deeper levels.
    const data = getStructuredContent(result) as any;
    expect(data.truncated).toBe(false);
    expect(data.totalPages).toBe(WIDTH + WIDTH * WIDTH + WIDTH * WIDTH * WIDTH);
    expect(childrenCalls).toBe(WIDTH + WIDTH * WIDTH);
    // The dispatch is synchronous through microtasks before any setTimeout
    // fires, and there is always far more queued work than the cap, so this
    // is deterministic, not flaky.
    expect(maxInFlight).toBe(5);
  });

  it("sets truncated: true and logs a warning when a chained call fails partway through the walk (2a)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const rootItems = [makeRootItem(makeId(0), true), makeRootItem(makeId(1), false)];

    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName === "get-document-root") {
          return { isError: false, structuredContent: { total: rootItems.length, items: rootItems }, content: [] };
        }
        if (toolName === "get-document-children") {
          // Simulates a network blip / 5xx on the deeper fetch — must not be
          // reported as "this node simply has no children".
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ type: "Error", title: "Internal Server Error", status: 500, detail: "boom" }),
              },
            ],
          };
        }
        if (toolName === "get-document-urls") {
          const ids = (args as { id: string[] }).id ?? [];
          return {
            isError: false,
            structuredContent: { items: ids.map((id) => ({ id, urlInfos: [] })) },
            content: [],
          };
        }
        throw new Error(`unexpected tool call: ${String(toolName)}`);
      },
    );

    try {
      const result = await callTool(reportSiteTreeSummaryTool, { maxDepth: 5, includeUrls: true }, {});

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.truncated).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fetchTreeLevel failed"));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("sets truncated: true when a level's total exceeds the items the page actually returned (2b)", async () => {
    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName === "get-document-root") {
          // Server reports 150 total children but the fixed-size page only
          // returns the first 100 — the new `truncated` field must not claim
          // completeness here.
          const items = Array.from({ length: 100 }, (_, i) => makeRootItem(makeId(i), false));
          return { isError: false, structuredContent: { total: 150, items }, content: [] };
        }
        if (toolName === "get-document-urls") {
          const ids = (args as { id: string[] }).id ?? [];
          return {
            isError: false,
            structuredContent: { items: ids.map((id) => ({ id, urlInfos: [] })) },
            content: [],
          };
        }
        throw new Error(`unexpected tool call: ${String(toolName)}`);
      },
    );

    const result = await callTool(reportSiteTreeSummaryTool, { maxDepth: 5, includeUrls: true }, {});

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.truncated).toBe(true);
    expect(data.totalPages).toBe(100);
  });

  it("skips get-document-urls entirely when includeUrls is false, and every node's url is ''", async () => {
    const rootItems = [makeRootItem(makeId(0), false), makeRootItem(makeId(1), false)];
    let urlCalls = 0;

    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown) => {
        if (toolName === "get-document-root") {
          return { isError: false, structuredContent: { total: rootItems.length, items: rootItems }, content: [] };
        }
        if (toolName === "get-document-urls") {
          urlCalls++;
          return { isError: false, structuredContent: { items: [] }, content: [] };
        }
        throw new Error(`unexpected tool call: ${String(toolName)}`);
      },
    );

    const result = await callTool(reportSiteTreeSummaryTool, { maxDepth: 1, includeUrls: false }, {});

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(urlCalls).toBe(0);
    expect(data.tree.every((n: any) => n.url === "")).toBe(true);
  });
});
