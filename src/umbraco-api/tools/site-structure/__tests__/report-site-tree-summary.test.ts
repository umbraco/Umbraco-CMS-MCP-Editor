/**
 * Integration tests for the report-site-tree-summary tool.
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import reportSiteTreeSummaryTool from "../get/report-site-tree-summary.js";

describe("report-site-tree-summary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return tree array, totalPages, pagesPerLevel, and maxDepthFound", async () => {
    const result = await reportSiteTreeSummaryTool.handler(
      { parentId: undefined, maxDepth: 3 },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.tree)).toBe(true);
    expect(typeof data.totalPages).toBe("number");
    expect(typeof data.pagesPerLevel).toBe("object");
    expect(typeof data.maxDepthFound).toBe("number");
    if (data.tree.length > 0) {
      expect(typeof data.tree[0].id).toBe("string");
      expect(typeof data.tree[0].name).toBe("string");
      expect(typeof data.tree[0].depth).toBe("number");
      expect(typeof data.tree[0].childCount).toBe("number");
    }
  }, 30000);
});
