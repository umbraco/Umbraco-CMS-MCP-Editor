/**
 * Blueprint Builder & Helper Tests
 *
 * Verifies the BlueprintBuilder and BlueprintTestHelper work correctly
 * via chained CMS tools against a real Umbraco instance.
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra, getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { BlueprintBuilder } from "./blueprint-builder.js";
import { BlueprintTestHelper } from "./blueprint-test-helper.js";
import listChildrenTool from "../../../content/get/list-children.js";

const TEST_BLUEPRINT_NAME = "_Test BlueprintBuilder";

describe("BlueprintBuilder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const result = await listChildrenTool.handler({ parentId: undefined }, extra);
    const data = getStructuredContent(result) as any;
    expect(data?.items?.length).toBeGreaterThan(0);
    testPageId = data.items[0].id;
  }, 60000);

  afterEach(async () => {
    await BlueprintTestHelper.cleanup(TEST_BLUEPRINT_NAME);
  }, 30000);

  it("should create a blueprint and return an ID", async () => {
    const bp = await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    expect(bp.getId()).toBeDefined();
    expect(bp.getId().length).toBeGreaterThan(0);
  }, 30000);

  it("should find a created blueprint by name", async () => {
    await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    const found = await BlueprintTestHelper.findBlueprint(TEST_BLUEPRINT_NAME);
    expect(found).toBeDefined();
    expect(found!.name ?? found!.variants?.[0]?.name).toBe(TEST_BLUEPRINT_NAME);
  }, 30000);

  it("should delete a created blueprint", async () => {
    const bp = await new BlueprintBuilder()
      .withName(TEST_BLUEPRINT_NAME)
      .withSourcePage(testPageId)
      .create();

    await bp.delete();

    const found = await BlueprintTestHelper.findBlueprint(TEST_BLUEPRINT_NAME);
    expect(found).toBeUndefined();
  }, 30000);

  it("should throw if create called without name", async () => {
    const builder = new BlueprintBuilder().withSourcePage(testPageId);
    await expect(builder.create()).rejects.toThrow(/must have a name/);
  });

  it("should throw if create called without source page", async () => {
    const builder = new BlueprintBuilder().withName("test");
    await expect(builder.create()).rejects.toThrow(/must have a source page/);
  });

  it("should throw if getId called before create", () => {
    const builder = new BlueprintBuilder();
    expect(() => builder.getId()).toThrow(/No blueprint has been created yet/);
  });

  it("cleanup should handle non-existent blueprint gracefully", async () => {
    await BlueprintTestHelper.cleanup("_NonExistent Blueprint 99999");
  }, 30000);

  it("listBlueprints should return an array", async () => {
    const items = await BlueprintTestHelper.listBlueprints();
    expect(items).toBeInstanceOf(Array);
  }, 30000);
});
