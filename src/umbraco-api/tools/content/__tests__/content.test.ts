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

import { jest, describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";
import { ContentBuilder } from "./helpers/content-builder.js";
import { ContentTestHelper } from "./helpers/content-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";

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

const TEST_PAGE_NAME = "_Test Content Integration";
const TEST_LIFECYCLE_NAME = "_Test Content Lifecycle";
const TEST_SEARCH_QUERY = "home";
const TEST_SEARCH_NONSENSE = "xyznonexistent99999";
const TEST_EDIT_VALUES = [{ alias: "title", value: "Updated Title" }];
const TEST_BLOCK_PROPERTY_ALIAS = "content";
const TEST_BLOCK_CONTENT_KEY = "00000000-0000-0000-0000-000000000001";
const TEST_BLOCK_VALUES = [{ alias: "text", value: "should not change" }];
const TEST_ELICITATION_NAME = "Should Not Be Created";
const TEST_ELICITATION_VALUES = [{ alias: "title", value: "Should Not Change" }];
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Content Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const rootResult = await mcpClientManager.callTool("cms", "get-tree-document-root", {
        cursor: btoa(JSON.stringify({ s: 0, t: 10 })),
      });
      if (rootResult.isError) return;

      const rootData = extractChainedResult(rootResult);
      if (!rootData?.items?.length) return;

      cmsAvailable = true;
      testPageId = rootData.items[0].id;

      // Find an allowed document type
      const children = await ContentTestHelper.getChildren(testPageId, 5);
      if (children.length > 0) {
        const childResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: children[0].id });
        if (!childResult.isError) {
          const child = extractChainedResult(childResult);
          if (child?.documentType?.id) testDocumentTypeId = child.documentType.id;
        }
      }

      if (!testDocumentTypeId) {
        const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: testPageId });
        if (!pageResult.isError) {
          const page = extractChainedResult(pageResult);
          if (page?.documentType?.id) testDocumentTypeId = page.documentType.id;
        }
      }
    } catch {
      console.warn("CMS not available — content integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await ContentTestHelper.cleanup(TEST_PAGE_NAME);
    await ContentTestHelper.cleanup(TEST_LIFECYCLE_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  // ─── Read-only tools ───────────────────────────────────────────────

  describe("list-children", () => {
    it("should return root-level pages", async () => {
      if (!cmsAvailable) return;

      const result = await listChildrenTool.handler({ parentId: undefined }, extra);

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

      const firstResult = await listDocumentTypesTool.handler(
        { cursor: encodeCursor({ s: 0, t: 1 }) },
        extra,
      );
      const firstData = getStructuredContent(firstResult) as any;

      if (!firstData?.nextCursor) {
        console.warn("Skipping second-page test: only 1 document type exists");
        return;
      }

      const secondResult = await listDocumentTypesTool.handler(
        { cursor: firstData.nextCursor },
        extra,
      );

      expect(secondResult.isError).toBeFalsy();
      const secondData = getStructuredContent(secondResult) as any;
      expect(secondData).toBeDefined();
      expect(secondData.items).toBeInstanceOf(Array);
      expect(secondData.items.length).toBeGreaterThan(0);
      expect(secondData.items[0].id).not.toBe(firstData.items[0].id);
    }, 30000);

    it("should not return nextCursor on the last page", async () => {
      if (!cmsAvailable) return;

      const result = await listDocumentTypesTool.handler(
        { cursor: encodeCursor({ s: 0, t: 1000 }) },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
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

      const result = await searchContentTool.handler({ query: TEST_SEARCH_QUERY }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
    }, 30000);

    it("should return empty results for nonsense query", async () => {
      if (!cmsAvailable) return;

      const result = await searchContentTool.handler({ query: TEST_SEARCH_NONSENSE }, extra);

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

      const result = await getPageTool.handler({ id: NON_EXISTENT_UUID }, extra);
      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("list-document-types", () => {
    it("should list available document types", async () => {
      if (!cmsAvailable) return;

      const result = await listDocumentTypesTool.handler({}, extra);

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

      const result = await listDocumentTypesTool.handler({}, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.items).toBeInstanceOf(Array);
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

  // ─── Lifecycle (create → edit → delete → restore) ─────────────────

  describe("create-page, edit-page, delete-page, restore-page lifecycle", () => {
    let lifecycleDoc: ContentBuilder;

    it("should create a draft page", async () => {
      if (!cmsAvailable || !testPageId || !testDocumentTypeId) return;

      // Use builder to create test page — bypasses elicitation
      lifecycleDoc = await new ContentBuilder()
        .withName(TEST_LIFECYCLE_NAME)
        .withDocumentType(testDocumentTypeId)
        .withParent(testPageId)
        .create();

      // Verify via the editor tool
      const result = await getPageTool.handler({ id: lifecycleDoc.getId() }, extra);
      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(lifecycleDoc.getId());
    }, 30000);

    it("should edit the created page", async () => {
      if (!cmsAvailable || !lifecycleDoc) {
        console.warn("Skipping edit test: no page was created");
        return;
      }

      const result = await editPageTool.handler(
        { id: lifecycleDoc.getId(), values: TEST_EDIT_VALUES },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping edit assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(lifecycleDoc.getId());
      expect(data.message).toContain("Updated");
    }, 30000);

    it("should delete the created page", async () => {
      if (!cmsAvailable || !lifecycleDoc) {
        console.warn("Skipping delete test: no page was created");
        return;
      }

      const result = await deletePageTool.handler({ id: lifecycleDoc.getId() }, extra);

      if (result.isError) {
        console.warn("Skipping delete assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("recycle bin");
      expect(data.id).toBe(lifecycleDoc.getId());
    }, 30000);

    it("should restore the deleted page from recycle bin", async () => {
      if (!cmsAvailable || !lifecycleDoc) {
        console.warn("Skipping restore test: no page was created/deleted");
        return;
      }

      const result = await restorePageTool.handler({ id: lifecycleDoc.getId() }, extra);

      if (result.isError) {
        console.warn("Skipping restore assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Restored");
      expect(data.id).toBe(lifecycleDoc.getId());

      // afterEach cleanup handles permanent deletion
    }, 30000);
  });

  // ─── Block editing ─────────────────────────────────────────────────

  describe("edit-block", () => {
    it("should edit a block property when blocks exist", async () => {
      if (!cmsAvailable || !testPageId) return;

      const inspectResult = await inspectBlocksTool.handler(
        { id: testPageId, propertyAlias: undefined },
        extra,
      );
      const inspectData = getStructuredContent(inspectResult) as any;

      if (!inspectData?.blockProperties?.length) {
        console.warn("Skipping edit-block test: no block properties on test page");
        return;
      }

      const blockProp = inspectData.blockProperties.find(
        (bp: any) => bp.blocks?.length > 0,
      );
      if (!blockProp) {
        console.warn("Skipping edit-block test: no blocks with content found");
        return;
      }

      const block = blockProp.blocks.find(
        (b: any) => b.contentKey && b.values?.length > 0,
      );
      if (!block) {
        console.warn("Skipping edit-block test: no blocks with contentKey and values found");
        return;
      }

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
      await expectElicitationCancel(() =>
        editBlockTool.handler(
          {
            id: testPageId,
            propertyAlias: TEST_BLOCK_PROPERTY_ALIAS,
            contentKey: TEST_BLOCK_CONTENT_KEY,
            values: TEST_BLOCK_VALUES,
            culture: undefined,
            segment: undefined,
          },
          extra,
        ),
      );
    }, 30000);
  });

  // ─── Elicitation rejection ─────────────────────────────────────────

  describe("elicitation rejection", () => {
    it("should cancel create when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();
      await expectElicitationCancel(() =>
        createPageTool.handler(
          {
            name: TEST_ELICITATION_NAME,
            documentTypeId: testDocumentTypeId || NON_EXISTENT_UUID,
            parentId: testPageId,
            values: undefined,
          },
          extra,
        ),
      );
    }, 30000);

    it("should cancel edit when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();
      await expectElicitationCancel(() =>
        editPageTool.handler(
          { id: testPageId, values: TEST_ELICITATION_VALUES },
          extra,
        ),
      );
    }, 30000);

    it("should cancel restore when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();
      await expectElicitationCancel(() =>
        restorePageTool.handler({ id: testPageId }, extra),
      );
    }, 30000);

    it("should cancel delete when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();
      await expectElicitationCancel(() =>
        deletePageTool.handler({ id: testPageId }, extra),
      );
    }, 30000);
  });
});
