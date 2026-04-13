/**
 * Integration tests for the report-site-tree-summary tool.
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
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

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
