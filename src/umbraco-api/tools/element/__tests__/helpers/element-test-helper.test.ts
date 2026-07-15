/**
 * Element Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { ElementTestHelper } from "./element-test-helper.js";
import { ElementBuilder } from "./element-builder.js";

const TEST_ELEMENT_NAME = "_Test ElementHelper";

describe("ElementTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await ElementTestHelper.cleanupByName(TEST_ELEMENT_NAME);
  }, 30000);

  it("findByName should return undefined for non-existent name", async () => {
    const found = await ElementTestHelper.findByName("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanupByName should handle non-existent element gracefully", async () => {
    await ElementTestHelper.cleanupByName("_NonExistent 99999");
  }, 30000);

  it("cleanup should handle non-existent ID gracefully", async () => {
    await ElementTestHelper.cleanup("00000000-0000-0000-0000-000000000000");
  }, 30000);

  it("createElementType should provision a creatable element type with a title property", async () => {
    const fixture = await ElementTestHelper.createElementType("_Test HelperCreateType");
    expect(fixture.id).toBeDefined();
    expect(fixture.propertyAlias).toBe("title");

    await ElementTestHelper.cleanupElementType(fixture.id);
  }, 30000);

  it("cleanupElementType should handle non-existent ID gracefully", async () => {
    await ElementTestHelper.cleanupElementType("00000000-0000-0000-0000-000000000000");
  }, 30000);

  it("findByName should find an element created at the Library root", async () => {
    const builder = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();

    const found = await ElementTestHelper.findByName(TEST_ELEMENT_NAME);
    expect(found).toBeDefined();
    expect(found?.id).toBe(builder.getId());
    expect(found?.isFolder).toBe(false);

    await builder.cleanupElementType();
  }, 30000);
});
