import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  findSchedulingParentAndType,
  createElicitation,
} from "./setup.js";
import cancelScheduleTool from "../post/cancel-schedule.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

async function pageHasSchedule(id: string): Promise<boolean> {
  const doc = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
  if (doc.isError) return false;
  const variants = extractChainedResult(doc)?.variants ?? [];
  return variants.some(
    (v: any) => v.scheduledPublishDate != null || v.scheduledUnpublishDate != null,
  );
}

/** Set a future scheduledUnpublishDate on a page via a direct CMS publish-document call. */
async function scheduleUnpublish(id: string, unpublishTime: string): Promise<void> {
  const res = await mcpClientManager.callTool("cms", "publish-document", {
    id,
    data: { publishSchedules: [{ culture: null, schedule: { unpublishTime } }] },
  });
  if (res.isError) {
    throw new Error(`Failed to schedule unpublish: ${JSON.stringify(res)}`);
  }
}

const elicitation = createElicitation();

describe("cancel-schedule", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  const token = `testcancelsched${Date.now().toString(36)}`;
  let pageId: string | null = null;

  beforeAll(async () => {
    const parentAndType = await findSchedulingParentAndType();
    if (!parentAndType) {
      throw new Error("Could not discover a parent page and document type for scheduling test setup");
    }
    // Create + publish a page so we can schedule an unpublish on it.
    // cancel-schedule can cleanly clear scheduledUnpublishDate on a published page;
    // cancelling a pending first-publish on a pure draft is limited Umbraco-side
    // (the draft is in "AwaitingRelease" state and re-publish is rejected).
    const builder = await new ContentBuilder()
      .withName(token)
      .withParent(parentAndType.parentId)
      .withDocumentType(parentAndType.documentTypeId)
      .create();
    pageId = builder.getId();
    await builder.publish();
  }, 90000);

  afterAll(async () => {
    if (pageId) {
      try { await ContentTestHelper.cleanupById(pageId); } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 60000);

  beforeEach(() => { elicitation.reset(); });

  it("should return aborted when the user rejects the elicitation on a real schedule", async () => {
    if (!pageId) throw new Error("Page was not created");

    const unpublishTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await scheduleUnpublish(pageId, unpublishTime);
    expect(await pageHasSchedule(pageId)).toBe(true);

    elicitation.rejectAll();
    const result = await cancelScheduleTool.handler(
      { id: pageId, culture: undefined },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("aborted");
    // Schedule should still be there since the user aborted
    expect(await pageHasSchedule(pageId)).toBe(true);
  }, 60000);

  it("should cancel a real scheduled unpublish and clear the schedule from the page", async () => {
    if (!pageId) throw new Error("Page was not created");

    const unpublishTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await scheduleUnpublish(pageId, unpublishTime);
    expect(await pageHasSchedule(pageId)).toBe(true);

    const cancelResult = await cancelScheduleTool.handler(
      { id: pageId, culture: undefined },
      extra,
    );
    expect(cancelResult.isError).toBeFalsy();
    const cancelData = getStructuredContent(cancelResult) as any;
    expect(cancelData.message).toContain("Cancelled");
    expect(cancelData.id).toBe(pageId);

    expect(await pageHasSchedule(pageId)).toBe(false);
  }, 60000);

  it("should report no schedule when the page has no pending schedule", async () => {
    if (!pageId) throw new Error("Page was not created");
    // Previous test cleared the schedule
    expect(await pageHasSchedule(pageId)).toBe(false);

    const result = await cancelScheduleTool.handler(
      { id: pageId, culture: undefined },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("No scheduled publish");
  }, 30000);
});
