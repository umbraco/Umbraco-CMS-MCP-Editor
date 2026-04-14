import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initBlueprintTestState,
  BlueprintBuilder,
  BlueprintTestHelper,
} from "./setup.js";
import listBlueprintsTool from "../get/list-blueprints.js";

const TEST_BLUEPRINT_NAME = "_Test List Blueprints";

describe("list-blueprints", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    // Clean up any stale blueprints from prior test runs
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
    const state = await initBlueprintTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterEach(async () => {
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
  }, 30000);

  it("should list root-level blueprints including created one", async () => {
    // Ensure at least one blueprint exists
    await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    const result = await listBlueprintsTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    // Use assertions — the full list varies with leftover data from other runs
    const data = result.structuredContent as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThan(0);

    // Verify our created blueprint appears in the list
    const found = data.items.find((item: any) => item.name === TEST_BLUEPRINT_NAME);
    expect(found).toBeDefined();
    expect(found.id).toBeDefined();
  }, 30000);

  it("should return items with expected shape", async () => {
    const result = await listBlueprintsTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
    }
  }, 30000);
});
