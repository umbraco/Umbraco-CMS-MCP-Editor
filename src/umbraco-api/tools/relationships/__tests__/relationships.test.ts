/**
 * Relationships Collection Integration Tests
 *
 * Tests for migrated tools (report-content-references, report-orphan-pages)
 * and new tool (report-outbound-links).
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import reportContentReferencesTool from "../get/report-content-references.js";
import reportOrphanPagesTool from "../get/report-orphan-pages.js";
import reportOutboundLinksTool from "../get/report-outbound-links.js";
import listChildrenTool from "../../content/get/list-children.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Relationships Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testPageId: string;
  let testMediaId: string;

  beforeAll(async () => {
    try {
      const [pageResult, mediaResult] = await Promise.all([
        listChildrenTool.handler({ parentId: undefined }, extra),
        listMediaChildrenTool.handler({ parentId: undefined }, extra),
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
      console.warn("CMS not available — relationships integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  // --- Migrated tools ---

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
  });

  describe("report-content-references (media)", () => {
    it("should return referencedBy and referenceCount for a media item", async () => {
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

  describe("report-orphan-pages", () => {
    it("should return items array with scannedPages count", async () => {
      if (!cmsAvailable) return;

      const result = await reportOrphanPagesTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedPages).toEqual(expect.any(Number));
      expect(data.total).toEqual(expect.any(Number));
    }, 60000);
  });

  // --- New tools ---

  describe("report-outbound-links", () => {
    it("should return internalPages, media, and externalUrls arrays", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await reportOutboundLinksTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.internalPages).toBeInstanceOf(Array);
      expect(data.media).toBeInstanceOf(Array);
      expect(data.externalUrls).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();
      expect(data.summary.totalLinks).toEqual(expect.any(Number));
    }, 60000);
  });

});
