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
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

// Mock the server-ref module — default: always accept
const mockElicitInput = jest.fn<() => Promise<{ action: string; content: Record<string, boolean> }>>();
mockElicitInput.mockResolvedValue({ action: "accept", content: { confirm: true } });

jest.unstable_mockModule("@/umbraco-api/server-ref", () => ({
  getServerRef: () => ({
    elicitInput: mockElicitInput,
  }),
  setServerRef: jest.fn(),
}));

// Dynamic imports after mocking
const { default: publishPageTool } = await import("../post/publish-page.js");
const { default: unpublishPageTool } = await import("../post/unpublish-page.js");
const { default: browseChildrenTool } = await import("../../content/get/browse-children.js");
const { default: createPageTool } = await import("../../content/post/create-page.js");
const { default: deletePageTool } = await import("../../content/delete/delete-page.js");

describe("Publishing Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let createdForTest = false;
  let cmsAvailable = false;

  beforeAll(async () => {
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
        } else {
          // Create a test page if none exist
          const { mcpClientManager } = await import("../../../mcp-client.js");
          const docTypesResult = await mcpClientManager.callTool("cms", "get-document-type-root", {
            take: 1,
            skip: 0,
          });
          const docTypes = docTypesResult.structuredContent as any;
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
  }, 30000);

  beforeEach(() => {
    // Reset elicitation mock to accept before each test
    mockElicitInput.mockResolvedValue({ action: "accept", content: { confirm: true } });
  });

  describe("publish-page", () => {
    it("should publish a page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await publishPageTool.handler(
        { id: testPageId, includeDescendants: false },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Published");
      expect(data.id).toBe(testPageId);
      expect(data.name).toEqual(expect.any(String));
    }, 30000);
  });

  describe("unpublish-page", () => {
    it("should unpublish a page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await unpublishPageTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
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

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("Published");
    }, 30000);
  });

  describe("elicitation rejection", () => {
    it("should cancel publish when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      // Configure mock to reject
      mockElicitInput.mockResolvedValue({ action: "reject", content: { confirm: false } });

      const result = await publishPageTool.handler(
        { id: testPageId, includeDescendants: false },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);

    it("should cancel unpublish when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      mockElicitInput.mockResolvedValue({ action: "reject", content: { confirm: false } });

      const result = await unpublishPageTool.handler(
        { id: testPageId },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);
  });
});
