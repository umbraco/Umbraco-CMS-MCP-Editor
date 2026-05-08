import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initSchedulingTestState,
  findSchedulingParentAndType,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getPublishStatusTool from "../get/get-publish-status.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";

describe("get-publish-status", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initSchedulingTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should return publish status for a known page", async () => {
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
    const result = await getPublishStatusTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);

  describe("when page is unpublished but has a future scheduled publish", () => {
    const token = `testpubstatussched${Date.now().toString(36)}`;
    let scheduledPageId: string | null = null;
    let scheduledDate: string;

    beforeAll(async () => {
      const parentAndType = await findSchedulingParentAndType();
      if (!parentAndType) {
        throw new Error("Could not discover a parent page and document type");
      }

      // Create a draft page (no publish call) so the document has never been
      // published. get-document-publish will 404 for this state.
      const builder = await new ContentBuilder()
        .withName(token)
        .withParent(parentAndType.parentId)
        .withDocumentType(parentAndType.documentTypeId)
        .create();
      scheduledPageId = builder.getId();

      // Schedule a future publish directly via the CMS to avoid coupling this
      // test to the editor schedule-publish elicitation. This is the same
      // approach cancel-schedule.test.ts uses.
      scheduledDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await mcpClientManager.callTool("cms", "publish-document", {
        id: scheduledPageId,
        data: { publishSchedules: [{ culture: null, schedule: { publishTime: scheduledDate } }] },
      });
      if (res.isError) {
        throw new Error(`Failed to schedule publish for setup: ${JSON.stringify(res)}`);
      }
    }, 90000);

    afterAll(async () => {
      if (scheduledPageId) {
        try { await ContentTestHelper.cleanupById(scheduledPageId); } catch { /* best-effort */ }
      }
    }, 60000);

    it("surfaces the scheduledPublishDate in variants instead of returning empty variants", async () => {
      if (!scheduledPageId) throw new Error("Scheduled page was not created");

      const result = await getPublishStatusTool.handler({ id: scheduledPageId }, extra);
      expect(result.isError).toBeFalsy();

      const data = getStructuredContent(result) as any;
      expect(data.id).toBe(scheduledPageId);
      expect(data.isPublished).toBe(false);
      expect(data.state).toBe("NotPublished");
      expect(data.variants).toBeInstanceOf(Array);
      expect(data.variants.length).toBeGreaterThan(0);

      const withSchedule = data.variants.find((v: any) => v.scheduledPublishDate != null);
      expect(withSchedule).toBeDefined();
      // Server may normalise the format (e.g. +00:00 vs Z) and round millis,
      // so compare as parsed Dates within a 1-second tolerance.
      const expectedMs = Date.parse(scheduledDate);
      const actualMs = Date.parse(withSchedule.scheduledPublishDate);
      expect(Math.abs(actualMs - expectedMs)).toBeLessThanOrEqual(1000);
    }, 30000);
  });
});
