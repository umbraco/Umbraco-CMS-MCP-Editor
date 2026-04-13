/**
 * Media Health Collection Integration Tests
 *
 * Tests for report-large-media.
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

import reportLargeMediaTool from "../get/report-large-media.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Media Health Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    const mediaResult = await listMediaChildrenTool.handler(
      { parentId: undefined },
      extra,
    );
    expect(mediaResult.isError).toBeFalsy();

    const mediaData = getStructuredContent(mediaResult) as any;
    expect(mediaData?.items?.length).toBeGreaterThan(0);
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("report-large-media", () => {
    it("should return structure with threshold and items having fileSizeKb", async () => {
      const result = await reportLargeMediaTool.handler(
        { minSizeKb: 1, parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.threshold).toEqual(expect.any(Number));
      expect(data.scannedItems).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("fileSizeKb");
        expect(data.items[0].fileSizeKb).toEqual(expect.any(Number));
      }
    }, 60000);
  });
});
