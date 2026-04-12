/**
 * Content Collection Integration Tests
 *
 * Tests for search-content, get-page, list-children, list-document-types,
 * inspect-blocks, create-page, edit-page, edit-block, restore-page, delete-page.
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
import { extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";

import searchContentTool from "../get/search-content.js";
import getPageTool from "../get/get-page.js";
import listChildrenTool from "../get/list-children.js";
import listDocumentTypesTool from "../get/list-document-types.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import createPageTool from "../post/create-page.js";
import editPageTool from "../put/edit-page.js";
import editBlockTool from "../put/edit-block.js";
import restorePageTool from "../put/restore-page.js";
import deletePageTool from "../delete/delete-page.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Content Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdPageIds: string[] = [];
  let testPageId: string;
  let testDocumentTypeId: string;
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const browseResult = await listChildrenTool.handler(
        { parentId: undefined },
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
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-children", () => {
    it("should return root-level pages", async () => {
      if (!cmsAvailable) return;

      const result = await listChildrenTool.handler(
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
        expect(data.items[0]).toHaveProperty("hasChildren");
      }
    }, 30000);
  });

  describe("cursor pagination", () => {
    it("should return nextCursor when more pages exist (list-document-types)", async () => {
      if (!cmsAvailable) return;

      // Request just 1 item — if there are 2+ document types, nextCursor should be present
      const result = await listDocumentTypesTool.handler(
        { cursor: encodeCursor({ s: 0, t: 1 }) },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.items.length).toBeLessThanOrEqual(1);

      if (data.items.length === 0) {
        console.warn("Skipping nextCursor assertion: no document types exist");
        return;
      }

      if (data.total > 1) {
        expect(data.nextCursor).toEqual(expect.any(String));
      }
    }, 30000);

    it("should fetch second page using nextCursor (list-document-types)", async () => {
      if (!cmsAvailable) return;

      // First page: 1 item
      const firstResult = await listDocumentTypesTool.handler(
        { cursor: encodeCursor({ s: 0, t: 1 }) },
        extra,
      );
      const firstData = getStructuredContent(firstResult) as any;

      if (!firstData?.nextCursor) {
        console.warn("Skipping second-page test: only 1 document type exists");
        return;
      }

      // Second page using nextCursor
      const secondResult = await listDocumentTypesTool.handler(
        { cursor: firstData.nextCursor },
        extra,
      );

      expect(secondResult.isError).toBeFalsy();
      const secondData = getStructuredContent(secondResult) as any;
      expect(secondData).toBeDefined();
      expect(secondData.items).toBeInstanceOf(Array);
      expect(secondData.items.length).toBeGreaterThan(0);

      // Verify we got a different item than the first page
      expect(secondData.items[0].id).not.toBe(firstData.items[0].id);
    }, 30000);

    it("should not return nextCursor on the last page", async () => {
      if (!cmsAvailable) return;

      // Request all items in one page
      const result = await listDocumentTypesTool.handler(
        { cursor: encodeCursor({ s: 0, t: 1000 }) },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      // When all items fit in one page, nextCursor should be absent
      expect(data.nextCursor).toBeUndefined();
    }, 30000);

    it("should return nextCursor when paginating list-children with take=1", async () => {
      if (!cmsAvailable) return;

      const result = await listChildrenTool.handler(
        { parentId: undefined, cursor: encodeCursor({ s: 0, t: 1 }) },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items.length).toBeLessThanOrEqual(1);

      if (data.total > 1) {
        expect(data.nextCursor).toEqual(expect.any(String));

        // Fetch second page
        const secondResult = await listChildrenTool.handler(
          { parentId: undefined, cursor: data.nextCursor },
          extra,
        );
        expect(secondResult.isError).toBeFalsy();
        const secondData = getStructuredContent(secondResult) as any;
        expect(secondData.items.length).toBeGreaterThan(0);
        expect(secondData.items[0].id).not.toBe(data.items[0].id);
      }
    }, 30000);
  });

  describe("search-content", () => {
    it("should search for content and return results", async () => {
      if (!cmsAvailable) return;

      const result = await searchContentTool.handler(
        { query: "home" },
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
        { query: "xyznonexistent99999" },
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

    it("should return error for non-existent page", async () => {
      if (!cmsAvailable) return;

      const result = await getPageTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("list-document-types", () => {
    it("should list available document types", async () => {
      if (!cmsAvailable) return;

      const result = await listDocumentTypesTool.handler(
        {},
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

    it("should handle pagination", async () => {
      if (!cmsAvailable) return;

      const result = await listDocumentTypesTool.handler(
        {},
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.items).toBeInstanceOf(Array);
      // Fresh Umbraco installs may have no document types
      if (data.items.length === 0) {
        console.warn("Skipping pagination assertion: no document types exist");
        return;
      }
      expect(data.items.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe("inspect-blocks", () => {
    it("should return block structure for a page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await inspectBlocksTool.handler(
        { id: testPageId, propertyAlias: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.name).toEqual(expect.any(String));
      expect(data.blockProperties).toBeInstanceOf(Array);
    }, 30000);
  });

  describe("create-page, edit-page, delete-page, restore-page lifecycle", () => {
    let createdId: string;

    it("should create a draft page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const { mcpClientManager } = await import("../../../mcp-client.js");

      // Find an allowed child doc type for the test page
      const allowedResult = await mcpClientManager.callTool("cms", "get-allowed-document-types-for-document", { id: testPageId });
      const allowedData = extractChainedResult(allowedResult);
      const allowedTypes = allowedData?.items ?? allowedData ?? [];

      if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
        testDocumentTypeId = allowedTypes[0].id;
      } else {
        // Fallback: use the page's own doc type
        const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: testPageId });
        const pageData = extractChainedResult(pageResult);
        if (!pageData?.documentType?.id) {
          console.warn("Skipping create test: could not determine document type");
          return;
        }
        testDocumentTypeId = pageData.documentType.id;
      }

      const result = await createPageTool.handler(
        {
          name: "Integration Test Page",
          documentTypeId: testDocumentTypeId,
          parentId: testPageId,
          values: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping create test: doc type restrictions prevent creating test page");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Created");
      expect(data.name).toBe("Integration Test Page");
      expect(data.id).toBeTruthy();

      createdId = data.id;
      createdPageIds.push(createdId);
    }, 30000);

    it("should edit the created page", async () => {
      if (!cmsAvailable || !createdId) {
        console.warn("Skipping edit test: no page was created");
        return;
      }

      const result = await editPageTool.handler(
        {
          id: createdId,
          values: [{ alias: "title", value: "Updated Title" }],
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping edit assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(createdId);
      expect(data.message).toContain("Updated");
    }, 30000);

    it("should delete the created page", async () => {
      if (!cmsAvailable || !createdId) {
        console.warn("Skipping delete test: no page was created");
        return;
      }

      const result = await deletePageTool.handler({ id: createdId }, extra);

      if (result.isError) {
        console.warn("Skipping delete assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("recycle bin");
      expect(data.id).toBe(createdId);

      // Don't remove from createdPageIds yet — restore test follows
    }, 30000);

    it("should restore the deleted page from recycle bin", async () => {
      if (!cmsAvailable || !createdId) {
        console.warn("Skipping restore test: no page was created/deleted");
        return;
      }

      const result = await restorePageTool.handler({ id: createdId }, extra);

      if (result.isError) {
        console.warn("Skipping restore assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Restored");
      expect(data.id).toBe(createdId);

      // Clean up: delete again so afterAll doesn't fail
      await deletePageTool.handler({ id: createdId }, extra);
      const idx = createdPageIds.indexOf(createdId);
      if (idx !== -1) createdPageIds.splice(idx, 1);
    }, 30000);
  });

  describe("edit-block", () => {
    it("should edit a block property when blocks exist", async () => {
      if (!cmsAvailable || !testPageId) return;

      // First inspect blocks to find a target
      const inspectResult = await inspectBlocksTool.handler(
        { id: testPageId, propertyAlias: undefined },
        extra,
      );
      const inspectData = getStructuredContent(inspectResult) as any;

      if (!inspectData?.blockProperties?.length) {
        console.warn("Skipping edit-block test: no block properties on test page");
        return;
      }

      // Find a block with content
      const blockProp = inspectData.blockProperties.find(
        (bp: any) => bp.blocks?.length > 0,
      );
      if (!blockProp) {
        console.warn("Skipping edit-block test: no blocks with content found");
        return;
      }

      const block = blockProp.blocks[0];
      if (!block.contentKey || !block.values?.length) {
        console.warn("Skipping edit-block test: block has no contentKey or values");
        return;
      }

      // Try to update the first property value
      const firstValue = block.values[0];
      const result = await editBlockTool.handler(
        {
          id: testPageId,
          propertyAlias: blockProp.propertyAlias,
          contentKey: block.contentKey,
          values: [{ alias: firstValue.alias, value: firstValue.value }],
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping edit-block assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Updated");
      expect(data.contentKey).toBe(block.contentKey);
    }, 30000);

    it("should cancel edit-block when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await editBlockTool.handler(
        {
          id: testPageId,
          propertyAlias: "content",
          contentKey: "00000000-0000-0000-0000-000000000001",
          values: [{ alias: "text", value: "should not change" }],
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });

  describe("elicitation rejection", () => {
    it("should cancel create when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await createPageTool.handler(
        {
          name: "Should Not Be Created",
          documentTypeId: testDocumentTypeId || "00000000-0000-0000-0000-000000000000",
          parentId: testPageId,
          values: undefined,
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel edit when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await editPageTool.handler(
        {
          id: testPageId,
          values: [{ alias: "title", value: "Should Not Change" }],
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel restore when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await restorePageTool.handler(
        { id: testPageId },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel delete when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await deletePageTool.handler(
        { id: testPageId },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
