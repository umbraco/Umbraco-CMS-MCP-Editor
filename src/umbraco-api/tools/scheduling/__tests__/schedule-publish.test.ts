import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  findSchedulingParentAndType,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import schedulePublishTool from "../post/schedule-publish.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const elicitation = createElicitation();

describe("schedule-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  const token = `testschedpub${Date.now().toString(36)}`;
  let pageId: string | null = null;

  beforeAll(async () => {
    const parentAndType = await findSchedulingParentAndType();
    if (!parentAndType) {
      throw new Error("Could not discover a parent page and document type for scheduling test setup");
    }
    const builder = await new ContentBuilder()
      .withName(token)
      .withParent(parentAndType.parentId)
      .withDocumentType(parentAndType.documentTypeId)
      .create();
    pageId = builder.getId();
  }, 90000);

  afterAll(async () => {
    if (pageId) {
      try { await ContentTestHelper.cleanupById(pageId); } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 60000);

  beforeEach(() => { elicitation.reset(); });

  it("should cancel schedule-publish when elicitation is rejected", async () => {
    if (!pageId) throw new Error("Page was not created");
    elicitation.rejectAll();

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await expectElicitationCancel(() =>
      schedulePublishTool.handler(
        { id: pageId!, publishDate: futureDate, culture: undefined },
        extra,
      ),
    );
  }, 30000);

  it("should schedule a future publish and record scheduledPublishDate on the draft", async () => {
    if (!pageId) throw new Error("Page was not created");

    const publishDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await schedulePublishTool.handler(
      { id: pageId, publishDate, culture: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Scheduled");
    expect(data.id).toBe(pageId);
    expect(data.scheduledDate).toBe(publishDate);

    // Verify the schedule is persisted on the draft variant. A draft-scheduled
    // page isn't visible via get-document-publish (404), so check get-document-by-id.
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
    const variants = extractChainedResult(docResult)?.variants ?? [];
    const hasSchedule = variants.some((v: any) => v.scheduledPublishDate != null);
    expect(hasSchedule).toBe(true);
  }, 60000);
});
