import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { RedirectBuilder } from "./redirect-builder.js";
import { RedirectTestHelper } from "./redirect-test-helper.js";

describe("RedirectBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from content)", () => {
    const builder = new RedirectBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
  });

  it("findDocument should be available via helper", async () => {
    const found = await RedirectTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);
});
