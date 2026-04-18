import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  findSchedulingParentAndType,
  createElicitation,
} from "./setup.js";
import listScheduledContentTool from "../get/list-scheduled-content.js";
import schedulePublishTool from "../post/schedule-publish.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";

const elicitation = createElicitation();

describe("list-scheduled-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  const token = `testlistsched${Date.now().toString(36)}`;
  let pageId: string | null = null;
  let parentId: string | null = null;

  beforeAll(async () => {
    const parentAndType = await findSchedulingParentAndType();
    if (!parentAndType) {
      throw new Error("Could not discover a parent page and document type for scheduling test setup");
    }
    parentId = parentAndType.parentId;

    const builder = await new ContentBuilder()
      .withName(token)
      .withParent(parentAndType.parentId)
      .withDocumentType(parentAndType.documentTypeId)
      .create();
    pageId = builder.getId();

    // Schedule a publish in the future so list-scheduled-content has something to return
    const publishDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const scheduleResult = await schedulePublishTool.handler(
      { id: pageId, publishDate, culture: undefined },
      extra,
    );
    if (scheduleResult.isError) {
      throw new Error(`Failed to schedule test page: ${JSON.stringify(scheduleResult)}`);
    }
  }, 90000);

  afterAll(async () => {
    if (pageId) {
      // Deleting the draft page also removes its pending schedule
      try { await ContentTestHelper.cleanupById(pageId); } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 60000);

  it("should list the scheduled test page under its parent", async () => {
    if (!pageId || !parentId) throw new Error("Test state not set up");

    const result = await listScheduledContentTool.handler({ parentId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
    expect(data.scannedPages).toEqual(expect.any(Number));

    const match = data.items.find((item: any) => item.id === pageId);
    expect(match).toBeDefined();
    expect(match.scheduledPublishDate).toEqual(expect.any(String));
    expect(match.name).toBe(token);
  }, 60000);
});
