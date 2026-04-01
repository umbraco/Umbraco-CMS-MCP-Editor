/**
 * Versioning Collection Integration Tests
 *
 * Tests for list-versions and rollback-page.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
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
const { default: listVersionsTool } = await import("../get/list-versions.js");
const { default: rollbackPageTool } = await import("../post/rollback-page.js");
const { default: listChildrenTool } = await import("../../content/get/browse-children.js");

describe("Versioning Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const browseResult = await listChildrenTool.handler(
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
      console.warn("CMS not available — versioning integration tests will be skipped");
    }
  }, 60000);

  beforeEach(() => {
    mockElicitInput.mockResolvedValue({ action: "accept", content: { confirm: true } });
  });

  describe("list-versions", () => {
    it("should list version history for a page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await listVersionsTool.handler(
        { id: testPageId, skip: 0, take: 10 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.pageName).toEqual(expect.any(String));
      expect(data.versions).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.versions.length > 0) {
        const version = data.versions[0];
        expect(version).toHaveProperty("versionId");
        expect(version).toHaveProperty("date");
      }
    }, 30000);

    it("should handle pagination", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await listVersionsTool.handler(
        { id: testPageId, skip: 0, take: 2 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.versions.length).toBeLessThanOrEqual(2);
    }, 30000);
  });

  describe("rollback-page", () => {
    it("should rollback to a previous version", async () => {
      if (!cmsAvailable || !testPageId) return;

      // Get versions first
      const versionsResult = await listVersionsTool.handler(
        { id: testPageId, skip: 0, take: 10 },
        extra,
      );
      const versionsData = getStructuredContent(versionsResult) as any;

      if (!versionsData?.versions?.length || versionsData.versions.length < 2) {
        console.warn("Skipping rollback test: fewer than 2 versions available");
        return;
      }

      // Pick a non-current version to rollback to (the second one)
      const targetVersion = versionsData.versions[1];
      const result = await rollbackPageTool.handler(
        { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Rolled back");
      expect(data.id).toBe(testPageId);
      expect(data.versionId).toBe(targetVersion.versionId);
    }, 30000);

    it("should cancel rollback when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      // Get a version ID
      const versionsResult = await listVersionsTool.handler(
        { id: testPageId, skip: 0, take: 5 },
        extra,
      );
      const versionsData = getStructuredContent(versionsResult) as any;

      if (!versionsData?.versions?.length) {
        console.warn("Skipping elicitation rejection test: no versions available");
        return;
      }

      // Configure mock to reject
      mockElicitInput.mockResolvedValue({ action: "reject", content: { confirm: false } });

      const targetVersion = versionsData.versions[0];
      const result = await rollbackPageTool.handler(
        { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);
  });
});
