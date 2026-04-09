/**
 * Relationships Collection Integration Tests
 *
 * Tests for migrated tools (report-content-references, report-orphan-pages, report-unused-media)
 * and new tools (report-outbound-links, report-most-referenced, report-relationship-map, report-external-links).
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
import reportUnusedMediaTool from "../get/report-unused-media.js";
import reportOutboundLinksTool from "../get/report-outbound-links.js";
import reportMostReferencedTool from "../get/report-most-referenced.js";
import reportRelationshipMapTool from "../get/report-relationship-map.js";
import reportExternalLinksTool from "../get/report-external-links.js";
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
        { parentId: undefined, take: 10, skip: 0 },
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

  describe("report-unused-media", () => {
    it("should return items with totalFileSize and scannedItems", async () => {
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

  describe("report-most-referenced", () => {
    it("should return items sorted by referenceCount", async () => {
      if (!cmsAvailable) return;

      const result = await reportMostReferencedTool.handler(
        { parentId: undefined, take: 10, skip: 0, type: "document" },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedItems).toEqual(expect.any(Number));
      expect(data.total).toEqual(expect.any(Number));

      // Verify descending sort
      if (data.items.length > 1) {
        expect(data.items[0].referenceCount).toBeGreaterThanOrEqual(data.items[1].referenceCount);
      }
    }, 60000);
  });

  describe("report-relationship-map", () => {
    it("should return inbound and outbound sections", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await reportRelationshipMapTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.inbound).toBeInstanceOf(Array);
      expect(data.outbound).toBeDefined();
      expect(data.outbound.internalPages).toBeInstanceOf(Array);
      expect(data.outbound.media).toBeInstanceOf(Array);
      expect(data.outbound.externalUrls).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();
      expect(data.summary.totalConnections).toEqual(expect.any(Number));
    }, 60000);
  });

  describe("report-external-links", () => {
    it("should return byDomain array with URL grouping", async () => {
      if (!cmsAvailable) return;

      const result = await reportExternalLinksTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.byDomain).toBeInstanceOf(Array);
      expect(data.totalUrls).toEqual(expect.any(Number));
      expect(data.totalDomains).toEqual(expect.any(Number));
      expect(data.scannedPages).toEqual(expect.any(Number));

      if (data.byDomain.length > 0) {
        expect(data.byDomain[0]).toHaveProperty("domain");
        expect(data.byDomain[0]).toHaveProperty("urls");
        expect(data.byDomain[0]).toHaveProperty("urlCount");
      }
    }, 60000);
  });
});
