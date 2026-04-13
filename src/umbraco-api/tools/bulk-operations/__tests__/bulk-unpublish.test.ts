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
import bulkUnpublishTool from "../post/bulk-unpublish.js";
import bulkPublishTool from "../post/bulk-publish.js";

const elicitation = createElicitation();

describe("bulk-unpublish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
  }, 60000);

  afterAll(async () => {
    // Re-publish to restore state
    if (firstRootPageId) {
      try {
        elicitation.reset();
        await bulkPublishTool.handler(
          { ids: [firstRootPageId], includeDescendants: false },
          extra,
        );
      } catch {
        // Best-effort restore
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should unpublish a single page and return results", async () => {
    const result = await bulkUnpublishTool.handler(
      { ids: [firstRootPageId] },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, firstRootPageId)).toMatchSnapshot();

    // Re-publish immediately to restore state
    elicitation.reset();
    await bulkPublishTool.handler(
      { ids: [firstRootPageId], includeDescendants: false },
      extra,
    );
  }, 60000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkUnpublishTool.handler(
        { ids: [firstRootPageId] },
        extra,
      ),
    );
  }, 30000);
});
