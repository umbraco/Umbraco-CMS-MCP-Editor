import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initSchedulingTestState,
  createElicitation,
} from "./setup.js";
import cancelScheduleTool from "../post/cancel-schedule.js";

const elicitation = createElicitation();

describe("cancel-schedule", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initSchedulingTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should cancel cancel-schedule when elicitation is rejected", async () => {
    elicitation.rejectAll();

    const result = await cancelScheduleTool.handler(
      { id: testPageId, culture: undefined },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toEqual(expect.any(String));

    const isAborted = data.message.includes("aborted");
    const isNoSchedule = data.message.includes("No scheduled publish");
    expect(isAborted || isNoSchedule).toBe(true);
  }, 30000);
});
