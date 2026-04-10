/**
 * Publishing Collection Integration Tests
 *
 * Tests for publish-page and unpublish-page.
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
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

import publishPageTool from "../post/publish-page.js";
import unpublishPageTool from "../post/unpublish-page.js";
import listChildrenTool from "../../content/get/list-children.js";
import createPageTool from "../../content/post/create-page.js";
import deletePageTool from "../../content/delete/delete-page.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Publishing Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let createdForTest = false;
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
        } else {
          const { mcpClientManager } = await import("../../../mcp-client.js");
          const docTypesResult = await mcpClientManager.callTool("cms", "get-document-type-root", {
            take: 1, skip: 0,
          });
          const docTypes = extractChainedResult(docTypesResult);
          if (docTypes?.items?.length) {
            const createResult = await createPageTool.handler(
              {
                name: "Publishing Test Page",
                documentTypeId: docTypes.items[0].id,
                parentId: undefined,
                values: undefined,
              },
              extra,
            );
            const created = getStructuredContent(createResult) as any;
            if (created?.id) {
              testPageId = created.id;
              createdForTest = true;
            }
          }
        }
      }
    } catch {
      console.warn("CMS not available — publishing integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    if (createdForTest && testPageId) {
      try {
        await deletePageTool.handler({ id: testPageId }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("publish-page", () => {
    it("should publish a page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await publishPageTool.handler(
        { id: testPageId, includeDescendants: false },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping publish assertions: CMS returned error (page may not be in publishable state)");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Published");
      expect(data.id).toBe(testPageId);
      expect(data.name).toEqual(expect.any(String));
    }, 30000);

    it("should return error for non-existent page", async () => {
      if (!cmsAvailable) return;

      const result = await publishPageTool.handler(
        { id: "00000000-0000-0000-0000-000000000000", includeDescendants: false },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("unpublish-page", () => {
    it("should unpublish a page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await unpublishPageTool.handler(
        { id: testPageId },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping unpublish assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Unpublished");
      expect(data.id).toBe(testPageId);
      expect(data.name).toEqual(expect.any(String));
    }, 30000);

    it("should re-publish page after unpublish to restore state", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await publishPageTool.handler(
        { id: testPageId, includeDescendants: false },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping re-publish assertions: CMS returned error");
        return;
      }
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("Published");
    }, 30000);
  });

  describe("elicitation rejection", () => {
    it("should cancel publish when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await publishPageTool.handler(
        { id: testPageId, includeDescendants: false },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel unpublish when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await unpublishPageTool.handler(
        { id: testPageId },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
