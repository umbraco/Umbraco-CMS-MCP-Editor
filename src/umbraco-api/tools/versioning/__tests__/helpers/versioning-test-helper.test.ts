/**
 * Versioning Test Helper Tests
 *
 * Verifies the re-exported ContentTestHelper works correctly under its alias.
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { VersioningTestHelper } from "./versioning-test-helper.js";

describe("VersioningTestHelper", () => {
  setupTestEnvironment();

  it("findDocument should return undefined for non-existent name", async () => {
    const found = await VersioningTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("getNameFromItem should return empty string for undefined", () => {
    expect(VersioningTestHelper.getNameFromItem(undefined)).toBe("");
  });

  it("getNameFromItem should return name from item with variants", () => {
    expect(VersioningTestHelper.getNameFromItem({
      id: "test",
      variants: [{ name: "Test Page" }],
    })).toBe("Test Page");
  });

  it("cleanup should handle non-existent document gracefully", async () => {
    await VersioningTestHelper.cleanup("_NonExistent 99999");
  }, 30000);
});
