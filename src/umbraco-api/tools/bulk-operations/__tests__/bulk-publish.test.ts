import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createSnapshotResult,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import bulkPublishTool from "../post/bulk-publish.js";

const elicitation = createElicitation();

describe("bulk-publish", () => {
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

  it("should return error when more than 10 IDs are provided", async () => {
    const tooManyIds = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );

    const result = await bulkPublishTool.handler(
      { ids: tooManyIds, includeDescendants: false },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("10");
  }, 10000);

  it("should return error when empty array is provided", async () => {
    let errorCaught = false;
    try {
      const result = await bulkPublishTool.handler(
        { ids: [] as any, includeDescendants: false },
        extra,
      );
      const data = getStructuredContent(result) as any;
      expect(data.message).toBeDefined();
      errorCaught = true;
    } catch {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  }, 10000);

  it("should publish a single page and return results with success and previousVersionId", async () => {
    const result = await bulkPublishTool.handler(
      { ids: [firstRootPageId], includeDescendants: false },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, firstRootPageId)).toMatchSnapshot();
  }, 30000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkPublishTool.handler(
        { ids: [firstRootPageId], includeDescendants: false },
        extra,
      ),
    );
  }, 30000);
});
