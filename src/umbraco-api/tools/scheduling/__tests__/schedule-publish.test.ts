import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initSchedulingTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import schedulePublishTool from "../post/schedule-publish.js";

const elicitation = createElicitation();

describe("schedule-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initSchedulingTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should cancel schedule-publish when elicitation is rejected", async () => {
    elicitation.rejectAll();

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await expectElicitationCancel(() =>
      schedulePublishTool.handler(
        { id: testPageId, publishDate: futureDate, culture: undefined },
        extra,
      ),
    );
  }, 30000);
});
