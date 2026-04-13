import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createSnapshotResult,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  FUTURE_DATE,
} from "./setup.js";
import bulkSchedulePublishTool from "../post/bulk-schedule-publish.js";

const elicitation = createElicitation();

describe("bulk-schedule-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  beforeEach(() => {
    elicitation.reset();
  });

  it("should schedule a page to publish at a future date", async () => {
    const result = await bulkSchedulePublishTool.handler(
      { ids: [firstRootPageId], publishDate: FUTURE_DATE },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(1);
    expect(data.results[0]).toHaveProperty("success");
    expect(data.results[0]).toHaveProperty("id");
  }, 30000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkSchedulePublishTool.handler(
        { ids: [firstRootPageId], publishDate: FUTURE_DATE },
        extra,
      ),
    );
  }, 30000);
});
