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
import bulkSetPropertyTool from "../post/bulk-set-property.js";

const elicitation = createElicitation();

describe("bulk-set-property", () => {
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

  it("should set a property on a page and return results with previousVersionId", async () => {
    const result = await bulkSetPropertyTool.handler(
      {
        ids: [firstRootPageId],
        alias: "title",
        value: "Bulk Test Value",
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, firstRootPageId)).toMatchSnapshot();
  }, 30000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkSetPropertyTool.handler(
        {
          ids: [firstRootPageId],
          alias: "title",
          value: "Should Not Be Set",
          culture: undefined,
          segment: undefined,
        },
        extra,
      ),
    );
  }, 30000);
});
