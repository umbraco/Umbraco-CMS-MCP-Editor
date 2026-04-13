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

  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import listMediaChildrenTool from "../get/list-media-children.js";
import searchMediaTool from "../get/search-media.js";
import getMediaTool from "../get/get-media.js";
import listMediaTypesTool from "../get/list-media-types.js";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Media Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testMediaId: string;

  beforeAll(async () => {
    const browseResult = await listMediaChildrenTool.handler(
      { parentId: undefined },
      extra,
    );
    expect(browseResult.isError).toBeFalsy();
    const browseData = getStructuredContent(browseResult) as any;
    expect(browseData).toBeDefined();
    if (browseData.items?.length > 0) {
      testMediaId = browseData.items[0].id;
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

      const result = await listMediaChildrenTool.handler(
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
        expect(data.items[0]).toHaveProperty("name");
        expect(data.items[0]).toHaveProperty("mediaType");
        expect(data.items[0]).toHaveProperty("hasChildren");
        expect(data.items[0]).toHaveProperty("isFolder");
      }
    }, 30000);
  });

  describe("search-media", () => {
    it("should search media and return results", async () => {

      const result = await searchMediaTool.handler(
        { query: "image", parentId: undefined },
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

      const result = await searchMediaTool.handler(
        { query: "xyznonexistentmedia99999", parentId: undefined },
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

      const result = await getMediaTool.handler({ id: testMediaId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testMediaId);
      expect(data.name).toEqual(expect.any(String));
      expect(typeof data.mediaType).toBe("string");
      expect(data.urls).toBeInstanceOf(Array);
      expect(data.values).toBeInstanceOf(Array);
    }, 30000);

    it("should return error for non-existent media item", async () => {

      const result = await getMediaTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("list-media-types", () => {
    it("should list allowed media types at root", async () => {

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
