import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { SiteStructureBuilder } from "./site-structure-builder.js";
import { SiteStructureTestHelper } from "./site-structure-test-helper.js";

describe("SiteStructureBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from content)", () => {
    const builder = new SiteStructureBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
  });

  it("findDocument should be available via helper", async () => {
    const found = await SiteStructureTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);
});
