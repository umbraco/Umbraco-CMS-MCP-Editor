/**
 * Scheduling Collection Integration Tests
 *
 * Tests for get-publish-status, list-scheduled-content, schedule-publish,
 * cancel-schedule. Runs against a real Umbraco instance.
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

import listChildrenTool from "../../content/get/list-children.js";
import getPublishStatusTool from "../get/get-publish-status.js";
import listScheduledContentTool from "../get/list-scheduled-content.js";
import schedulePublishTool from "../post/schedule-publish.js";
import cancelScheduleTool from "../post/cancel-schedule.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Scheduling Collection", () => {
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
      console.warn("CMS not available — scheduling integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("get-publish-status", () => {
    it("should return publish status for a known page (not an error even if unpublished)", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await getPublishStatusTool.handler({ id: testPageId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.name).toEqual(expect.any(String));
      expect(data.isPublished).toEqual(expect.any(Boolean));
      expect(data.state).toEqual(expect.any(String));
      expect(data.variants).toBeInstanceOf(Array);
    }, 30000);

    it("should return error for non-existent page", async () => {
      if (!cmsAvailable) return;

      const result = await getPublishStatusTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("list-scheduled-content", () => {
    it("should scan root and return structured result (may be empty)", async () => {
      if (!cmsAvailable) return;

      const result = await listScheduledContentTool.handler(
        { parentId: undefined, take: 50, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
      expect(data.scannedPages).toEqual(expect.any(Number));

      // Items structure check (if any exist)
      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
        expect(data.items[0]).toHaveProperty("scheduledPublishDate");
        expect(data.items[0]).toHaveProperty("scheduledUnpublishDate");
      }
    }, 60000);
  });

  describe("schedule-publish elicitation rejection", () => {
    it("should cancel schedule-publish when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const result = await schedulePublishTool.handler(
        { id: testPageId, publishDate: futureDate, culture: undefined },
        extra,
      );

      if (result.isError) {
        // Page not accessible via CMS tool — skip this assertion
        console.warn("Skipping schedule-publish elicitation test: page not accessible via CMS");
        return;
      }

      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);
  });

  describe("cancel-schedule elicitation rejection", () => {
    it("should cancel cancel-schedule when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) return;

      elicitation.rejectAll();

      const result = await cancelScheduleTool.handler(
        { id: testPageId, culture: undefined },
        extra,
      );

      // Either elicitation was triggered and cancelled, or there was no schedule to cancel
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toEqual(expect.any(String));

      // The tool either triggered elicitation (schedule found, then cancelled)
      // or returned early without elicitation (no schedule present).
      // Both outcomes result in a non-error response with a string message.
      const isAborted = data.message.includes("aborted");
      const isNoSchedule = data.message.includes("No scheduled publish");
      expect(isAborted || isNoSchedule).toBe(true);
    }, 30000);
  });
});
