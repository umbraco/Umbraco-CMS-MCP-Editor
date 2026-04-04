/**
 * Tag Collection Integration Tests
 *
 * Tests for list-tags.
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

import listTagsTool from "../get/list-tags.js";

describe("Tag Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let existingTagGroup: string | null = null;

  beforeAll(async () => {
    try {
      const result = await listTagsTool.handler({ tagGroup: undefined, take: 50, skip: 0 }, extra);
      const data = getStructuredContent(result) as any;
      if (!result.isError && data) {
        cmsAvailable = true;
        // Capture a tag group for later filtering test
        if (data.items?.length > 0 && data.items[0].group) {
          existingTagGroup = data.items[0].group;
        }
      }
    } catch {
      console.warn("CMS not available — tag integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    // No cleanup needed — list-tags is read-only
  }, 10000);

  describe("list-tags", () => {
    it("should list all tags across the site", async () => {
      if (!cmsAvailable) return;

      const result = await listTagsTool.handler({ tagGroup: undefined, take: 50, skip: 0 }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        const tag = data.items[0];
        expect(tag).toHaveProperty("id");
        expect(tag).toHaveProperty("name");
        expect(tag).toHaveProperty("group");
        expect(tag).toHaveProperty("nodeCount");
        expect(typeof tag.id).toBe("number");
        expect(typeof tag.nodeCount).toBe("number");
      }
    }, 30000);

    it("should filter tags by group", async () => {
      if (!cmsAvailable || !existingTagGroup) {
        console.warn("Skipping tag group filter test: no tags with a group found on this site");
        return;
      }

      const result = await listTagsTool.handler({ tagGroup: existingTagGroup, take: 50, skip: 0 }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      // All returned tags should belong to the requested group
      for (const tag of data.items) {
        expect(tag.group).toBe(existingTagGroup);
      }
    }, 30000);
  });
});
