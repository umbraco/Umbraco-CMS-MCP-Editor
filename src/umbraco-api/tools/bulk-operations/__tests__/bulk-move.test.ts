import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  FAKE_TARGET_UUID,
} from "./setup.js";
import bulkMoveTool from "../post/bulk-move.js";

const elicitation = createElicitation();

describe("bulk-move", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let secondRootPageId: string | undefined;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    secondRootPageId = state.secondRootPageId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should reject move when elicitation is rejected (with real pages)", async () => {

    elicitation.rejectAll();

    const result = await bulkMoveTool.handler(
      { ids: [firstRootPageId], targetParentId: secondRootPageId! },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
  }, 30000);

  it("should cancel when elicitation is rejected (with fake target)", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkMoveTool.handler(
        { ids: [firstRootPageId], targetParentId: FAKE_TARGET_UUID },
        extra,
      ),
    );
  }, 30000);
});
