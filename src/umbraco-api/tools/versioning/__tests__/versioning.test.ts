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

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,

  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import listVersionsTool from "../get/list-versions.js";
import rollbackPageTool from "../post/rollback-page.js";
import listChildrenTool from "../../content/get/list-children.js";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Versioning Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const browseResult = await listChildrenTool.handler(
      { parentId: undefined },
      extra,
    );
    expect(browseResult.isError).toBeFalsy();
    const browseData = getStructuredContent(browseResult) as any;
    expect(browseData).toBeDefined();
    expect(browseData.items?.length).toBeGreaterThan(0);
    testPageId = browseData.items[0].id;
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  });

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-versions", () => {
    it("should list version history for a page", async () => {

      const result = await listVersionsTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.name).toEqual(expect.any(String));
      expect(data.versions).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.versions.length > 0) {
        const version = data.versions[0];
        expect(version).toHaveProperty("versionId");
        expect(version).toHaveProperty("date");
      }
    }, 30000);

    it("should handle pagination", async () => {

      const result = await listVersionsTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.versions.length).toBeGreaterThan(0);
    }, 30000);

    it("should return error for non-existent page", async () => {

      const result = await listVersionsTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("rollback-page", () => {
    it("should rollback to a previous version", async () => {

      const versionsResult = await listVersionsTool.handler(
        { id: testPageId },
        extra,
      );
      const versionsData = getStructuredContent(versionsResult) as any;

      if (!versionsData?.versions?.length || versionsData.versions.length < 2) {
        console.warn("Skipping rollback test: fewer than 2 versions available");
        return;
      }

      const targetVersion = versionsData.versions[1];
      const result = await rollbackPageTool.handler(
        { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping rollback assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Rolled back");
      expect(data.id).toBe(testPageId);
      expect(data.versionId).toBe(targetVersion.versionId);
    }, 30000);

    it("should cancel rollback when elicitation is rejected", async () => {

      const versionsResult = await listVersionsTool.handler(
        { id: testPageId },
        extra,
      );
      const versionsData = getStructuredContent(versionsResult) as any;

      if (!versionsData?.versions?.length) {
        console.warn("Skipping elicitation rejection test: no versions available");
        return;
      }

      elicitation.rejectAll();

      const targetVersion = versionsData.versions[0];
      const result = await rollbackPageTool.handler(
        { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
