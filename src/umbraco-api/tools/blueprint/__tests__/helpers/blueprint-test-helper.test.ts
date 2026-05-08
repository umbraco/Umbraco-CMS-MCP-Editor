/**
 * Blueprint Test Helper Tests
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra, getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { BlueprintTestHelper } from "./blueprint-test-helper.js";
import { BlueprintBuilder } from "./blueprint-builder.js";
import listChildrenTool from "../../../content/get/list-children.js";

const TEST_BLUEPRINT_NAME = "_Test BlueprintHelper";

describe("BlueprintTestHelper", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const result = await listChildrenTool.handler({ parentId: undefined }, extra);
    const data = getStructuredContent(result) as any;
    testPageId = data.items[0].id;
  }, 60000);

  afterEach(async () => {
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
  }, 30000);

  it("findBlueprint should find a created blueprint by name", async () => {
    await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    const found = await BlueprintTestHelper.findBlueprint(TEST_BLUEPRINT_NAME);
    expect(found).toBeDefined();
    expect(found!.id).toBeDefined();
  }, 30000);

  it("findBlueprint should return undefined for non-existent name", async () => {
    const found = await BlueprintTestHelper.findBlueprint("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("listBlueprints should return an array", async () => {
    const items = await BlueprintTestHelper.listBlueprints();
    expect(items).toBeInstanceOf(Array);
  }, 30000);

  it("getNameFromItem should return name or empty string", () => {
    expect(BlueprintTestHelper.getNameFromItem(undefined)).toBe("");
    expect(BlueprintTestHelper.getNameFromItem({ id: "test", name: "foo" })).toBe("foo");
  });

  it("cleanup should remove a blueprint permanently", async () => {
    await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);

    const found = await BlueprintTestHelper.findBlueprint(TEST_BLUEPRINT_NAME);
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanup should handle non-existent blueprint gracefully", async () => {
    await BlueprintTestHelper.cleanup("_NonExistent Blueprint 99999");
  }, 30000);
});
