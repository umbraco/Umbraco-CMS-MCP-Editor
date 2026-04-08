/**
 * Media Collection Integration Tests
 *
 * Tests for list-media-children, search-media, get-media, list-media-types.
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

import listMediaChildrenTool from "../get/list-media-children.js";
import searchMediaTool from "../get/search-media.js";
import getMediaTool from "../get/get-media.js";
import listMediaTypesTool from "../get/list-media-types.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Media Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testMediaId: string;

  beforeAll(async () => {
    try {
      const browseResult = await listMediaChildrenTool.handler(
        { parentId: undefined, take: 5, skip: 0 },
        extra,
      );
      const browseData = getStructuredContent(browseResult) as any;
      if (!browseResult.isError && browseData) {
        cmsAvailable = true;
        if (browseData.items?.length > 0) {
          testMediaId = browseData.items[0].id;
        }
      }
    } catch {
      console.warn("CMS not available — media integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-media-children", () => {
    it("should return root-level media items", async () => {
      if (!cmsAvailable) return;

      const result = await listMediaChildrenTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
        expect(data.items[0]).toHaveProperty("mediaType");
        expect(data.items[0]).toHaveProperty("hasChildren");
        expect(data.items[0]).toHaveProperty("isFolder");
      }
    }, 30000);
  });

  describe("search-media", () => {
    it("should search media and return results", async () => {
      if (!cmsAvailable) return;

      const result = await searchMediaTool.handler(
        { query: "image", parentId: undefined, take: 5, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
        expect(data.items[0]).toHaveProperty("mediaType");
        expect(data.items[0]).toHaveProperty("url");
      }
    }, 30000);

    it("should return empty results for nonsense query", async () => {
      if (!cmsAvailable) return;

      const result = await searchMediaTool.handler(
        { query: "xyznonexistentmedia99999", parentId: undefined, take: 5, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.items.length).toBe(0);
      expect(data.total).toBe(0);
    }, 30000);
  });

  describe("get-media", () => {
    it("should get media item details by ID", async () => {
      if (!cmsAvailable || !testMediaId) return;

      const result = await getMediaTool.handler({ id: testMediaId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testMediaId);
      expect(data.name).toEqual(expect.any(String));
      expect(data.mediaType).toBeDefined();
      expect(data.urls).toBeInstanceOf(Array);
      expect(data.values).toBeInstanceOf(Array);
    }, 30000);

    it("should return error for non-existent media item", async () => {
      if (!cmsAvailable) return;

      const result = await getMediaTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("list-media-types", () => {
    it("should list allowed media types at root", async () => {
      if (!cmsAvailable) return;

      const result = await listMediaTypesTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("alias");
        expect(data.items[0]).toHaveProperty("name");
      }
    }, 30000);
  });
});
