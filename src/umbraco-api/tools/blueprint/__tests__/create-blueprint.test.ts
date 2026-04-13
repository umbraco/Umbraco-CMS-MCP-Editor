import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initBlueprintTestState,
  createElicitation,
  expectElicitationCancel,
  BlueprintTestHelper,
} from "./setup.js";
import createBlueprintTool from "../post/create-blueprint.js";
import getBlueprintTool from "../get/get-blueprint.js";

const TEST_BLUEPRINT_NAME = "_Test Create Blueprint";

const elicitation = createElicitation();

describe("create-blueprint", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initBlueprintTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should create a blueprint from a page", async () => {
    const result = await createBlueprintTool.handler(
      { pageId: testPageId, name: TEST_BLUEPRINT_NAME },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;

    // Verify via get-blueprint if we got an ID back
    if (data.id) {
      const verifyResult = await getBlueprintTool.handler({ id: data.id }, extra);
      expect(createSnapshotResult(verifyResult, data.id)).toMatchSnapshot();
    }
  }, 30000);

  it("should cancel create when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createBlueprintTool.handler(
        { pageId: testPageId, name: "Should Not Be Created Blueprint" },
        extra,
      ),
    );
  }, 30000);
});
