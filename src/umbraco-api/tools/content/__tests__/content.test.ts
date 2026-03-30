/**
 * Content Collection Integration Tests
 *
 * Tests for search-content, get-page, browse-children, create-page, edit-page, delete-page.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

// Mock the server-ref module so elicitation always accepts
jest.unstable_mockModule("@/umbraco-api/server-ref", () => ({
  getServerRef: () => ({
    elicitInput: jest.fn<() => Promise<{ action: string; content: Record<string, boolean> }>>()
      .mockResolvedValue({ action: "accept", content: { confirm: true } }),
  }),
  setServerRef: jest.fn(),
}));

// Dynamic imports after mocking
const { default: searchContentTool } = await import("../get/search-content.js");
const { default: getPageTool } = await import("../get/get-page.js");
const { default: browseChildrenTool } = await import("../get/browse-children.js");
const { default: createPageTool } = await import("../post/create-page.js");
const { default: editPageTool } = await import("../put/edit-page.js");
const { default: deletePageTool } = await import("../delete/delete-page.js");

describe("Content Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdPageIds: string[] = [];
  let testPageId: string;
  let testDocumentTypeId: string;
  let cmsAvailable = false;

  beforeAll(async () => {
    // Check connectivity by attempting to browse root pages
    try {
      const browseResult = await browseChildrenTool.handler(
        { parentId: undefined, take: 5, skip: 0 },
        extra,
      );
      const browseData = getStructuredContent(browseResult) as any;
      if (!browseResult.isError && browseData) {
        cmsAvailable = true;
        if (browseData.items?.length > 0) {
          testPageId = browseData.items[0].id;
        }
      }
    } catch {
      console.warn("CMS not available — content integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    for (const id of createdPageIds) {
      try {
        await deletePageTool.handler({ id }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
  }, 30000);

  describe("browse-children", () => {
    it("should return root-level pages", async () => {
      if (!cmsAvailable) return;

      const result = await browseChildrenTool.handler(
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
        expect(data.items[0]).toHaveProperty("hasChildren");
      }
    }, 30000);
  });

  describe("search-content", () => {
    it("should search for content and return results", async () => {
      if (!cmsAvailable) return;

      const result = await searchContentTool.handler(
        { query: "home", take: 5, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
    }, 30000);

    it("should return empty results for nonsense query", async () => {
      if (!cmsAvailable) return;

      const result = await searchContentTool.handler(
        { query: "xyznonexistent99999", take: 5, skip: 0 },
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

  describe("get-page", () => {
    it("should get page details by ID", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await getPageTool.handler({ id: testPageId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.name).toEqual(expect.any(String));
      expect(data.documentType).toEqual(expect.any(String));
      expect(data.values).toBeInstanceOf(Array);
      expect(data.variants).toBeInstanceOf(Array);
    }, 30000);
  });

  describe("create-page, edit-page, delete-page lifecycle", () => {
    let createdId: string;

    it("should create a draft page", async () => {
      if (!cmsAvailable || !testPageId) return;

      // Get a document type ID from the chained CMS server
      const { mcpClientManager } = await import("../../../mcp-client.js");
      const docTypesResult = await mcpClientManager.callTool("cms", "get-document-type-root", {
        take: 10,
        skip: 0,
      });

      const docTypes = docTypesResult.structuredContent as any;
      if (!docTypes?.items?.length) {
        console.warn("Skipping create test: no document types found");
        return;
      }

      testDocumentTypeId = docTypes.items[0].id;

      const result = await createPageTool.handler(
        {
          name: "Integration Test Page",
          documentTypeId: testDocumentTypeId,
          parentId: undefined,
          values: undefined,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Created");
      expect(data.name).toBe("Integration Test Page");
      expect(data.id).toBeTruthy();

      createdId = data.id;
      createdPageIds.push(createdId);
    }, 30000);

    it("should edit the created page", async () => {
      if (!cmsAvailable || !createdId) return;

      const result = await editPageTool.handler(
        {
          id: createdId,
          values: [
            { alias: "title", value: "Updated Title" },
          ],
        },
        extra,
      );

      // The edit may fail if the doc type doesn't have a "title" property,
      // but it should not throw — it should return a structured result
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(createdId);
    }, 30000);

    it("should delete the created page", async () => {
      if (!cmsAvailable || !createdId) return;

      const result = await deletePageTool.handler({ id: createdId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("recycle bin");
      expect(data.id).toBe(createdId);

      // Remove from cleanup list since already deleted
      const idx = createdPageIds.indexOf(createdId);
      if (idx !== -1) createdPageIds.splice(idx, 1);
    }, 30000);
  });
});
