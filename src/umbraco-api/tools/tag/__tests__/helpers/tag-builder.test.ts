import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { TagBuilder } from "./tag-builder.js";
import { TagTestHelper } from "./tag-test-helper.js";

describe("TagBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from content)", () => {
    const builder = new TagBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
  });

  it("findDocument should be available via helper", async () => {
    const found = await TagTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);
});
