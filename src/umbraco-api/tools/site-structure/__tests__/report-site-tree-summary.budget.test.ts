/**
 * Unit coverage for report-site-tree-summary's perf fix
 * (Umbraco-CMS-MCP-Editor#306): the concurrency cap on sibling subtree
 * fetches, the node/time budget that sets `truncated: true`, and the
 * `includeUrls` opt-out. None of this is practically provokable against a
 * real Umbraco instance (hitting a 500-node or 20s budget would mean
 * creating hundreds of real pages, and asserting an exact concurrency
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

  it("stops at the time budget and reports truncated: true even with plenty of node budget left", async () => {
    _setBudgetOverridesForTests({ timeBudgetMs: 5 });

    // Three levels, each with children, each chained call deliberately slower
    // than the 5ms time budget so the deadline is long gone before the walk
    // reaches the deepest level.
    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (toolName === "get-document-root") {
          return {
            isError: false,
            structuredContent: { total: 1, items: [makeRootItem(makeId(0), true)] },
            content: [],
          };
        }
        if (toolName === "get-document-children") {
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
    // Didn't walk anywhere near the (un-overridden) 500-node budget.
    expect(data.totalPages).toBeLessThan(500);
  });

  it("fans sibling subtree fetches out with a concurrency cap, never more than 5 get-document-children calls in flight", async () => {
    const SIBLING_COUNT = 12;
    const rootItems = Array.from({ length: SIBLING_COUNT }, (_, i) => makeRootItem(makeId(i), true));

    let inFlight = 0;
    let maxInFlight = 0;
    let childrenCalls = 0;

    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName === "get-document-root") {
          return { isError: false, structuredContent: { total: rootItems.length, items: rootItems }, content: [] };
        }
        if (toolName === "get-document-children") {
          childrenCalls++;
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 15));
          inFlight--;
          // Leaf level — no grandchildren, so each subtree fetch is exactly
          // one get-document-children call.
          return { isError: false, structuredContent: { total: 0, items: [] }, content: [] };
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
    expect(childrenCalls).toBe(SIBLING_COUNT);
    // Capped at ~4-6 concurrent, per the issue — never the full 12 (unbounded
    // Promise.all) and never 1 (fully serial, the original bug).
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(6);
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
