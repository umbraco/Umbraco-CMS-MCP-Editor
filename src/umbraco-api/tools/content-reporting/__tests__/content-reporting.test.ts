/**
 * Content Reporting Collection Integration Tests
 *
 * Tests for report-stale-content, report-unpublished, report-recently-changed,
 * report-content-by-type, report-translation-coverage.
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

import reportStaleContentTool from "../get/report-stale-content.js";
import reportUnpublishedTool from "../get/report-unpublished.js";
import reportRecentlyChangedTool from "../get/report-recently-changed.js";
import reportContentByTypeTool from "../get/report-content-by-type.js";
import reportTranslationCoverageTool from "../get/report-translation-coverage.js";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Content Reporting Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const result = await reportRecentlyChangedTool.handler(
        { daysBack: 3650, parentId: undefined },
        extra,
      );
      if (!result.isError) {
        cmsAvailable = true;
      }
    } catch {
      console.warn("CMS not available — content-reporting integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("report-stale-content", () => {
    it("should return items with daysSinceUpdate and threshold fields", async () => {
      if (!cmsAvailable) return;

      const result = await reportStaleContentTool.handler(
        { daysSinceUpdate: 1, parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedPages).toEqual(expect.any(Number));
      expect(data.threshold).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("daysSinceUpdate");
        expect(data.items[0].daysSinceUpdate).toEqual(expect.any(Number));
      }
    }, 30000);
  });

  describe("report-unpublished", () => {
    it("should return items with state field", async () => {
      if (!cmsAvailable) return;

      const result = await reportUnpublishedTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedPages).toEqual(expect.any(Number));
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("state");
        expect(data.items[0].state).toEqual(expect.any(String));
      }
    }, 30000);
  });

  describe("report-recently-changed", () => {
    it("should return items with daysAgo and period fields", async () => {
      if (!cmsAvailable) return;

      const result = await reportRecentlyChangedTool.handler(
        { daysBack: 3650, parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedPages).toEqual(expect.any(Number));
      expect(data.period).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("daysAgo");
        expect(data.items[0].daysAgo).toEqual(expect.any(Number));
      }
    }, 30000);
  });

  describe("report-content-by-type", () => {
    it("should return items grouped by documentType with count and pages array", async () => {
      if (!cmsAvailable) return;

      const result = await reportContentByTypeTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.totalTypes).toEqual(expect.any(Number));
      expect(data.totalPages).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("documentType");
        expect(data.items[0]).toHaveProperty("count");
        expect(data.items[0]).toHaveProperty("pages");
        expect(data.items[0].count).toEqual(expect.any(Number));
        expect(data.items[0].pages).toBeInstanceOf(Array);
      }
    }, 30000);
  });

  describe("report-translation-coverage", () => {
    it("should return languages array, items with cultures, and summary object", async () => {
      if (!cmsAvailable) return;

      const result = await reportTranslationCoverageTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.languages).toBeInstanceOf(Array);
      expect(data.items).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("cultures");
        expect(data.items[0].cultures).toBeDefined();
      }
    }, 30000);
  });
});
