/**
 * Publishing Test Helper Tests
 *
 * Verifies the re-exported ContentTestHelper works correctly under its alias.
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { PublishingTestHelper } from "./publishing-test-helper.js";

describe("PublishingTestHelper", () => {
  setupTestEnvironment();

  it("findDocument should return undefined for non-existent name", async () => {
    const found = await PublishingTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("getNameFromItem should return empty string for undefined", () => {
    expect(PublishingTestHelper.getNameFromItem(undefined)).toBe("");
  });

  it("getNameFromItem should return name from item with variants", () => {
    expect(PublishingTestHelper.getNameFromItem({
      id: "test",
      variants: [{ name: "Test Page" }],
    })).toBe("Test Page");
  });

  it("cleanup should handle non-existent document gracefully", async () => {
    await PublishingTestHelper.cleanup("_NonExistent 99999");
  }, 30000);
});
