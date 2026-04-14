import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { RelationshipsBuilder } from "./relationships-builder.js";
import { RelationshipsTestHelper } from "./relationships-test-helper.js";

describe("RelationshipsBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from content)", () => {
    const builder = new RelationshipsBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
  });

  it("findDocument should be available via helper", async () => {
    const found = await RelationshipsTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);
});
