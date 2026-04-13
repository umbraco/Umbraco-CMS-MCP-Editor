/**
 * Site Structure Collection Integration Tests
 *
 * Tests for report-site-tree-summary and report-deep-pages.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,

  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import reportSiteTreeSummaryTool from "../get/report-site-tree-summary.js";
import reportDeepPagesTool from "../get/report-deep-pages.js";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Site Structure Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    const result = await reportSiteTreeSummaryTool.handler(
      { parentId: undefined, maxDepth: 2 },
      extra,
    );
    expect(result.isError).toBeFalsy();
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("report-site-tree-summary", () => {
    it("should return tree array, totalPages, pagesPerLevel, and maxDepthFound", async () => {
      const result = await reportSiteTreeSummaryTool.handler(
        { parentId: undefined, maxDepth: 3 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.tree).toBeInstanceOf(Array);
      expect(data.totalPages).toEqual(expect.any(Number));
      expect(data.pagesPerLevel).toBeDefined();
      expect(data.maxDepthFound).toEqual(expect.any(Number));
    }, 30000);
  });

  describe("report-deep-pages", () => {
    it("should return structure with threshold field (may be empty)", async () => {
      const result = await reportDeepPagesTool.handler(
        { depthThreshold: 4, parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
      expect(data.threshold).toEqual(expect.any(Number));
    }, 30000);
  });
});
