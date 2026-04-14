import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { VersioningBuilder } from "./versioning-builder.js";
import { VersioningTestHelper } from "./versioning-test-helper.js";

describe("VersioningBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from content)", () => {
    const builder = new VersioningBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
  });

  it("findDocument should be available via helper", async () => {
    const found = await VersioningTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);
});
