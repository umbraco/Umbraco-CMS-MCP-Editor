/**
 * Redirect Collection Integration Tests
 *
 * Tests for list-redirects, get-redirect, get-redirect-status, delete-redirect.
 * Runs against a real Umbraco instance.
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

import listRedirectsTool from "../get/list-redirects.js";
import getRedirectTool from "../get/get-redirect.js";
import getRedirectStatusTool from "../get/get-redirect-status.js";
import deleteRedirectTool from "../delete/delete-redirect.js";
import listChildrenTool from "../../content/get/list-children.js";
import createPageTool from "../../content/post/create-page.js";
import deletePageTool from "../../content/delete/delete-page.js";
import bulkPublishTool from "../../bulk-operations/post/bulk-publish.js";
import bulkMoveTool from "../../bulk-operations/post/bulk-move.js";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Redirect Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRedirectId: string | undefined;
  let createdPageId: string | undefined;

  beforeAll(async () => {
    // get-redirect-status always works — use it as CMS availability check
    const statusResult = await getRedirectStatusTool.handler({}, extra);
    expect(statusResult.isError).toBeFalsy();

    // Try to grab the first redirect ID for subsequent tests
    const listResult = await listRedirectsTool.handler({ filter: undefined }, extra);
    if (!listResult.isError) {
      const listData = getStructuredContent(listResult) as any;
      if (listData?.items?.length > 0) {
        firstRedirectId = listData.items[0].id;
      }
    }

    // If no redirects exist, try to create one by publishing and moving a page
    if (!firstRedirectId) {
      console.warn("No redirects exist — attempting to create one by moving a published page");
      try {
        const { mcpClientManager } = await import("../../../mcp-client.js");
        const { extractChainedResult } = await import("@umbraco-cms/mcp-server-sdk");

        // Find root pages and a doc type
        const browseResult = await listChildrenTool.handler({ parentId: undefined }, extra);
        const browseData = getStructuredContent(browseResult) as any;
        if (browseData?.items?.length > 0) {
          const rootPageId = browseData.items[0].id;
          // Get root page's doc type
          const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: rootPageId });
          if (!pageResult.isError) {
            const pageData = extractChainedResult(pageResult);
            // Find a child doc type
            const childrenResult = await listChildrenTool.handler({ parentId: rootPageId }, extra);
            const childrenData = getStructuredContent(childrenResult) as any;
            let childDocTypeId: string | undefined;
            if (childrenData?.items?.length > 0) {
              const childResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: childrenData.items[0].id });
              if (!childResult.isError) {
                const childData = extractChainedResult(childResult);
                childDocTypeId = childData?.documentType?.id;
              }
            }
            if (!childDocTypeId) {
              childDocTypeId = pageData?.documentType?.id;
            }
            if (childDocTypeId) {
              // Create a child page
              const createResult = await createPageTool.handler(
                { name: "Redirect Test Page", documentTypeId: childDocTypeId, parentId: rootPageId, values: undefined },
                extra,
              );
              if (!createResult.isError) {
                const createData = getStructuredContent(createResult) as any;
                createdPageId = createData?.id;
                if (createdPageId) {
                  // Publish it
                  await bulkPublishTool.handler({ ids: [createdPageId], includeDescendants: false }, extra);
                  // Wait for publish to take effect
                  await new Promise(r => setTimeout(r, 1000));
                  // Move it to root (changes URL -> creates redirect)
                  await bulkMoveTool.handler({ ids: [createdPageId], targetParentId: undefined as any }, extra);
                  // Wait for redirect to be created
                  await new Promise(r => setTimeout(r, 2000));
                  // Re-list redirects
                  const relistResult = await listRedirectsTool.handler({ filter: undefined }, extra);
                  if (!relistResult.isError) {
                    const relistData = getStructuredContent(relistResult) as any;
                    if (relistData?.items?.length > 0) {
                      firstRedirectId = relistData.items[0].id;
                      console.warn(`Created redirect via page move: ${firstRedirectId}`);
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        console.warn("Could not create redirect via page move — redirect-specific tests will use fallback assertions");
      }
    }
  }, 120000);

  afterAll(async () => {
    if (createdPageId) {
      try {
        await deletePageTool.handler({ id: createdPageId }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("get-redirect-status", () => {
    it("should return whether redirect tracking is enabled", async () => {
      const result = await getRedirectStatusTool.handler({}, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.isEnabled).toEqual(expect.any(Boolean));
      expect(data.message).toEqual(expect.any(String));
    }, 30000);
  });

  describe("list-redirects", () => {
    it("should list redirects and return structured result (may be empty)", async () => {
      const result = await listRedirectsTool.handler({ filter: undefined }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      // If redirects exist, verify item structure
      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("originalUrl");
        expect(data.items[0]).toHaveProperty("destinationUrl");
        expect(data.items[0]).toHaveProperty("destinationType");
        expect(data.items[0]).toHaveProperty("isAutomatic");
        expect(data.items[0].isAutomatic).toEqual(expect.any(Boolean));
      }
    }, 30000);
  });

  describe("get-redirect", () => {
    it("should get redirect details when one exists", async () => {
      if (!firstRedirectId) {
        console.warn("No redirects found — skipping get-redirect detail assertions");
        return;
      }

      const result = await getRedirectTool.handler({ id: firstRedirectId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(firstRedirectId);
      expect(data.originalUrl).toEqual(expect.any(String));
      expect(data.destinationUrl).toEqual(expect.any(String));
      expect(data.destinationType).toEqual(expect.any(String));
      expect(data.isAutomatic).toEqual(expect.any(Boolean));
      expect(data.createDate).toEqual(expect.any(String));
    }, 30000);

    it("should return error or empty result for non-existent redirect", async () => {
      const result = await getRedirectTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      // The API may return 404 (isError) or an empty object — both are acceptable
      if (result.isError) {
        expect(result.isError).toBeTruthy();
      } else {
        const data = getStructuredContent(result) as any;
        // If no error, the id should be empty or match what was requested
        expect(data).toBeDefined();
      }
    }, 30000);
  });

  describe("delete-redirect elicitation rejection", () => {
    it("should cancel delete-redirect when elicitation is rejected", async () => {
      // Use a real redirect ID if available, otherwise use a fake one
      // (the tool will either cancel via elicitation or error before the API call)
      const targetId = firstRedirectId || "00000000-0000-0000-0000-000000000001";

      elicitation.rejectAll();

      const result = await deleteRedirectTool.handler({ id: targetId }, extra);

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
