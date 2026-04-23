/**
 * set-content-notifications integration tests
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev
 * MCP server. Each test captures the original subscription state, writes a
 * new one, verifies the round-trip via get-content-notifications, and
 * restores the original state so runs are idempotent.
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
import setContentNotificationsTool from "../put/set-content-notifications.js";

describe("set-content-notifications", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string | undefined;
  let originalSubscribedActionIds: string[] = [];
  let allActionIds: string[] = [];
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const browseResult = await listChildrenTool.handler(
        { parentId: undefined },
        extra,
      );
      const browseData = getStructuredContent(browseResult) as any;
      if (!browseResult.isError && browseData?.items?.length > 0) {
        testPageId = browseData.items[0].id;
      }

      if (testPageId) {
        const readResult = await getContentNotificationsTool.handler({ id: testPageId }, extra);
        if (!readResult.isError) {
          cmsAvailable = true;
          const readData = getStructuredContent(readResult) as any;
          originalSubscribedActionIds = [...(readData.subscribedActionIds ?? [])];
          allActionIds = (readData.subscriptions ?? [])
            .map((s: any) => s.actionId)
            .filter((x: string) => x);
        }
      }
    } catch {
      console.warn("CMS not available — set-content-notifications tests will be skipped");
    }
  }, 60000);

  it("should subscribe to every available action", async () => {
    if (!cmsAvailable || !testPageId || allActionIds.length === 0) return;

    const result = await setContentNotificationsTool.handler(
      { id: testPageId, subscribedActionIds: allActionIds },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(testPageId);
    expect(data.subscribedActionIds).toEqual(allActionIds);

    // Verify via round-trip
    const verifyResult = await getContentNotificationsTool.handler({ id: testPageId }, extra);
    const verifyData = getStructuredContent(verifyResult) as any;
    expect(verifyData.subscriptions.every((s: any) => s.subscribed)).toBe(true);

    // Restore
    await setContentNotificationsTool.handler(
      { id: testPageId, subscribedActionIds: originalSubscribedActionIds },
      extra,
    );
  }, 60000);

  it("should clear all subscriptions when given an empty array", async () => {
    if (!cmsAvailable || !testPageId) return;

    const result = await setContentNotificationsTool.handler(
      { id: testPageId, subscribedActionIds: [] },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.subscribedActionIds).toEqual([]);

    const verifyResult = await getContentNotificationsTool.handler({ id: testPageId }, extra);
    const verifyData = getStructuredContent(verifyResult) as any;
    expect(verifyData.subscriptions.every((s: any) => !s.subscribed)).toBe(true);

    // Restore
    await setContentNotificationsTool.handler(
      { id: testPageId, subscribedActionIds: originalSubscribedActionIds },
      extra,
    );
  }, 60000);
});
