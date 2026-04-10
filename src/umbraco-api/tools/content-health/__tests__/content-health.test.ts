/**
 * Content Health Collection Integration Tests
 *
 * Tests for audit-page-seo, audit-page-content, report-empty-fields,
 * report-short-content, report-media-missing-alt.
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

import auditPageSeoTool from "../get/audit-page-seo.js";
import auditPageContentTool from "../get/audit-page-content.js";
import reportEmptyFieldsTool from "../get/report-empty-fields.js";
import reportShortContentTool from "../get/report-short-content.js";
import reportMediaMissingAltTool from "../get/report-media-missing-alt.js";
import listChildrenTool from "../../content/get/list-children.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Content Health Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testPageId: string;

  beforeAll(async () => {
    try {
      const listResult = await listChildrenTool.handler(
        { parentId: undefined },
        extra,
      );
      const listData = getStructuredContent(listResult) as any;
      if (!listResult.isError && listData?.items?.length > 0) {
        cmsAvailable = true;
        testPageId = listData.items[0].id;
      }
    } catch {
      console.warn("CMS not available — content-health integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("audit-page-seo", () => {
    it("should audit a known page and return SEO fields", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await auditPageSeoTool.handler({ id: testPageId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.hasTitle).toEqual(expect.any(Boolean));
      expect(data.hasMetaDescription).toEqual(expect.any(Boolean));
      expect(data.headings).toBeInstanceOf(Array);
      expect(data.images).toBeInstanceOf(Array);
      expect(data.bodyWordCount).toEqual(expect.any(Number));
    }, 30000);

    it("should return error for non-existent page ID", async () => {
      if (!cmsAvailable) return;

      const result = await auditPageSeoTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("audit-page-content", () => {
    it("should audit content body and meta for a known page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await auditPageContentTool.handler({ id: testPageId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.bodyContent).toEqual(expect.any(String));
      expect(data.metaDescription).toEqual(expect.any(String));
      expect(data.bodyWordCount).toEqual(expect.any(Number));
    }, 30000);
  });

  describe("report-empty-fields", () => {
    it("should scan root pages and return items with empty fields array", async () => {
      if (!cmsAvailable) return;

      const result = await reportEmptyFieldsTool.handler(
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
        expect(data.items[0]).toHaveProperty("emptyFields");
        expect(data.items[0].emptyFields).toBeInstanceOf(Array);
        expect(data.items[0]).toHaveProperty("emptyFieldCount");
        expect(data.items[0].emptyFieldCount).toEqual(expect.any(Number));
      }
    }, 30000);
  });

  describe("report-short-content", () => {
    it("should scan with default threshold and return wordCount and threshold fields", async () => {
      if (!cmsAvailable) return;

      const result = await reportShortContentTool.handler(
        { minWordCount: 100, parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedPages).toEqual(expect.any(Number));
      expect(data.threshold).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("wordCount");
        expect(data.items[0].wordCount).toEqual(expect.any(Number));
      }
    }, 30000);
  });

  describe("report-media-missing-alt", () => {
    it("should scan media root and return alt text status fields", async () => {
      if (!cmsAvailable) return;

      const result = await reportMediaMissingAltTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.totalImages).toEqual(expect.any(Number));
      expect(data.missingAltCount).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("hasAlt");
        expect(data.items[0].hasAlt).toEqual(expect.any(Boolean));
      }
    }, 60000);
  });
});
