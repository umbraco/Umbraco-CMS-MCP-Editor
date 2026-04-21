import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initBlueprintTestState,
  BlueprintTestHelper,
} from "./setup.js";
import createBlueprintTool from "../post/create-blueprint.js";
import getBlueprintTool from "../get/get-blueprint.js";

const TEST_BLUEPRINT_NAME = "_Test Create Blueprint";

describe("create-blueprint", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
    const state = await initBlueprintTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterEach(async () => {
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
  }, 30000);

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
});
