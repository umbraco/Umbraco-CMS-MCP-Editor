import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  FAKE_TARGET_UUID,
  BulkOperationsTestHelper,
} from "./setup.js";
import bulkMoveTool from "../post/bulk-move.js";
import deletePageTool from "../../content/delete/delete-page.js";

const elicitation = createElicitation();

describe("bulk-move", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let secondRootPageId: string | undefined;
  let createdSecondRootPageId: string | undefined;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    secondRootPageId = state.secondRootPageId;
    createdSecondRootPageId = state.createdSecondRootPageId;
  }, 60000);

  afterAll(async () => {
    if (createdSecondRootPageId) {
      try {
        await deletePageTool.handler({ id: createdSecondRootPageId }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should reject move when elicitation is rejected (with real pages)", async () => {
    if (!secondRootPageId) {
      console.warn("Skipping bulk-move live test: only one root page available");
      return;
    }

    elicitation.rejectAll();

    const result = await bulkMoveTool.handler(
      { ids: [firstRootPageId], targetParentId: secondRootPageId },
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
