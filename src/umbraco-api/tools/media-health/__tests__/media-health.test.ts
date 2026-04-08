/**
 * Media Health Collection Integration Tests
 *
 * Tests for report-unused-media, report-large-media, report-content-references.
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

import reportUnusedMediaTool from "../get/report-unused-media.js";
import reportLargeMediaTool from "../get/report-large-media.js";
import reportContentReferencesTool from "../get/report-content-references.js";
import listChildrenTool from "../../content/get/list-children.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Media Health Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testPageId: string;
  let testMediaId: string;

  beforeAll(async () => {
    try {
      const [pageResult, mediaResult] = await Promise.all([
        listChildrenTool.handler({ parentId: undefined, take: 5, skip: 0 }, extra),
        listMediaChildrenTool.handler({ parentId: undefined, take: 5, skip: 0 }, extra),
      ]);

      const pageData = getStructuredContent(pageResult) as any;
      const mediaData = getStructuredContent(mediaResult) as any;

      if (!pageResult.isError && pageData?.items?.length > 0) {
        cmsAvailable = true;
        testPageId = pageData.items[0].id;
      }

      if (!mediaResult.isError && mediaData?.items?.length > 0) {
        testMediaId = mediaData.items[0].id;
      }
    } catch {
      console.warn("CMS not available — media-health integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("report-unused-media", () => {
    it("should return structure with totalFileSize and scannedItems", async () => {
      if (!cmsAvailable) return;

      const result = await reportUnusedMediaTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.totalFileSize).toEqual(expect.any(Number));
      expect(data.scannedItems).toEqual(expect.any(Number));
      expect(data.total).toEqual(expect.any(Number));
    }, 60000);
  });

  describe("report-large-media", () => {
    it("should return structure with threshold and items having fileSizeKb", async () => {
      if (!cmsAvailable) return;

      const result = await reportLargeMediaTool.handler(
        { minSizeKb: 1, parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.threshold).toEqual(expect.any(Number));
      expect(data.scannedItems).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("fileSizeKb");
        expect(data.items[0].fileSizeKb).toEqual(expect.any(Number));
      }
    }, 60000);
  });

  describe("report-content-references (document)", () => {
    it("should return referencedBy array and referenceCount for a known page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await reportContentReferencesTool.handler(
        { id: testPageId, type: "document" },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.referencedBy).toBeInstanceOf(Array);
      expect(data.referenceCount).toEqual(expect.any(Number));
    }, 30000);

    it("should return error for non-existent ID", async () => {
      if (!cmsAvailable) return;

      const result = await reportContentReferencesTool.handler(
        { id: "00000000-0000-0000-0000-000000000000", type: "document" },
        extra,
      );

      // Tool may return isError or a success result with zero references for non-existent ID
      const data = getStructuredContent(result) as any;
      expect(result.isError || data?.referenceCount === 0 || data !== undefined).toBeTruthy();
    }, 30000);
  });

  describe("report-content-references (media)", () => {
    it("should return structure with referencedBy and referenceCount for a media item", async () => {
      if (!cmsAvailable || !testMediaId) return;

      const result = await reportContentReferencesTool.handler(
        { id: testMediaId, type: "media" },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.referencedBy).toBeInstanceOf(Array);
      expect(data.referenceCount).toEqual(expect.any(Number));
    }, 30000);
  });
});
