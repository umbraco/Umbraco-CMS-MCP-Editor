import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  FUTURE_DATE,
} from "./setup.js";
import listChildrenTool from "../../content/get/list-children.js";
import bulkSchedulePublishTool from "../post/bulk-schedule-publish.js";
import { withHumanInTheLoopBlocking } from "../../../../testing/human-in-the-loop-test-helper.js";

const elicitation = createElicitation();

describe("bulk-schedule-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let blogPageId: string;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    blogPageId = state.blogPageId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  beforeEach(() => {
    elicitation.reset();
  });

  it("should bulk schedule multiple pages to publish at a future date", async () => {
    // Use existing blog articles (already published with valid content)
    const blogChildren = getStructuredContent(
      await listChildrenTool.handler({ parentId: blogPageId }, extra),
    ) as any;
    if (blogChildren.items?.length < 2) throw new Error("Need at least 2 blog articles");
    const articleIds = blogChildren.items.slice(0, 2).map((i: any) => i.id);

    const result = await bulkSchedulePublishTool.handler(
      { ids: articleIds, publishDate: FUTURE_DATE },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(2);
    expect(data.successCount).toBe(2);
    expect(data.failureCount).toBe(0);
  }, 60000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkSchedulePublishTool.handler(
        { ids: [firstRootPageId], publishDate: FUTURE_DATE },
        extra,
      ),
    );
  }, 30000);

  it("blocks bulk-schedule-publish when the human-in-the-loop gate is enabled, before touching the CMS", async () => {
    await withHumanInTheLoopBlocking(async () => {
      const result = await bulkSchedulePublishTool.handler(
        { ids: ["00000000-0000-0000-0000-000000000000"], publishDate: FUTURE_DATE },
        extra,
      );
      expect(result.isError).toBe(true);
      expect(getStructuredContent(result)).toEqual(
        expect.objectContaining({ status: 403, title: expect.stringContaining("blocked") }),
      );
    });
  }, 30000);
});
