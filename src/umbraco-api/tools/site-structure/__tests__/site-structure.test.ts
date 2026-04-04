/**
 * Site Structure Collection Integration Tests
 *
 * Tests for report-site-tree-summary, report-orphan-pages, report-deep-pages.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import reportSiteTreeSummaryTool from "../get/report-site-tree-summary.js";
import reportOrphanPagesTool from "../get/report-orphan-pages.js";
import reportDeepPagesTool from "../get/report-deep-pages.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Site Structure Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const result = await reportSiteTreeSummaryTool.handler(
        { parentId: undefined, maxDepth: 2 },
        extra,
      );
      if (!result.isError) {
        cmsAvailable = true;
      }
    } catch {
      console.warn("CMS not available — site-structure integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("report-site-tree-summary", () => {
    it("should return tree array, totalPages, pagesPerLevel, and maxDepthFound", async () => {
      if (!cmsAvailable) return;

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

  describe("report-orphan-pages", () => {
    it("should return structure with items array and scannedPages (may be empty)", async () => {
      if (!cmsAvailable) return;

      const result = await reportOrphanPagesTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
      expect(data.scannedPages).toEqual(expect.any(Number));
    }, 30000);
  });

  describe("report-deep-pages", () => {
    it("should return structure with threshold field (may be empty)", async () => {
      if (!cmsAvailable) return;

      const result = await reportDeepPagesTool.handler(
        { maxDepth: 4, parentId: undefined, take: 10, skip: 0 },
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
