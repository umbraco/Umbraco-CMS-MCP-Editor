import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initBlueprintTestState,
  BlueprintBuilder,
  BlueprintTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getBlueprintTool from "../get/get-blueprint.js";

const TEST_BLUEPRINT_NAME = "_Test Get Blueprint";

describe("get-blueprint", () => {
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

  it("should get blueprint details by ID", async () => {
    const bp = await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    const result = await getBlueprintTool.handler({ id: bp.getId() }, extra);

    expect(result.isError).toBeFalsy();
    // Use assertions instead of snapshot — blueprint captures source page
    // property values which change when other tests modify the Home page
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(bp.getId());
    expect(data.name).toBe(TEST_BLUEPRINT_NAME);
    expect(data.documentType).toBeDefined();
    expect(data.values).toBeInstanceOf(Array);
    expect(data.variants).toBeInstanceOf(Array);
  }, 30000);

  it("should return error for non-existent blueprint", async () => {
    const result = await getBlueprintTool.handler(
      { id: NON_EXISTENT_UUID },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 30000);
});
