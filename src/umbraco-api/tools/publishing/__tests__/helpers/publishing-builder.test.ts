/**
 * Publishing Builder & Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { PublishingBuilder } from "./publishing-builder.js";
import { PublishingTestHelper } from "./publishing-test-helper.js";

describe("PublishingBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from content)", () => {
    const builder = new PublishingBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
    expect(typeof builder.withDocumentType).toBe("function");
  });

  it("findDocument should be available via helper", async () => {
    const found = await PublishingTestHelper.findDocument("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);
});
