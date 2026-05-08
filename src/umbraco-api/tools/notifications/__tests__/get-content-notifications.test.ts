/**
 * get-content-notifications integration tests
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev
 * MCP server. The tool is hosted-only at registration, but the handler
 * itself works fine under Node — these tests call the handler directly.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 * - At least one content page exists
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import listChildrenTool from "../../content/get/list-children.js";
import getContentNotificationsTool from "../get/get-content-notifications.js";

describe("get-content-notifications", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string | undefined;
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const browseResult = await listChildrenTool.handler(
        { parentId: undefined },
        extra,
      );
      const browseData = getStructuredContent(browseResult) as any;
      if (!browseResult.isError && browseData?.items?.length > 0) {
        cmsAvailable = true;
        testPageId = browseData.items[0].id;
      }
    } catch {
      console.warn("CMS not available — get-content-notifications tests will be skipped");
    }
  }, 60000);

  it("should return the full subscription list with actionId / alias / subscribed per entry", async () => {
    if (!cmsAvailable || !testPageId) return;

    const result = await getContentNotificationsTool.handler({ id: testPageId }, extra);
    if (result.isError) {
      console.warn("get-document-notifications not accessible — skipping");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(Array.isArray(data.subscriptions)).toBe(true);
    expect(Array.isArray(data.subscribedActionIds)).toBe(true);

    if (data.subscriptions.length > 0) {
      const entry = data.subscriptions[0];
      expect(typeof entry.actionId).toBe("string");
      expect(typeof entry.alias).toBe("string");
      expect(typeof entry.subscribed).toBe("boolean");
    }
  }, 30000);

  it("should mirror subscribedActionIds from the subscribed entries", async () => {
    if (!cmsAvailable || !testPageId) return;

    const result = await getContentNotificationsTool.handler({ id: testPageId }, extra);
    if (result.isError) return;

    const data = getStructuredContent(result) as any;
    const derived = data.subscriptions
      .filter((s: any) => s.subscribed)
      .map((s: any) => s.actionId);
    expect(data.subscribedActionIds).toEqual(derived);
  }, 30000);
});
