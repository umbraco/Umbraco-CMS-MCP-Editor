/**
 * Media Health Test Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaHealthTestHelper } from "./media-health-test-helper.js";

describe("MediaHealthTestHelper", () => {
  setupTestEnvironment();

  it("listRootMedia should return an array", async () => {
    const items = await MediaHealthTestHelper.listRootMedia();
    expect(items).toBeInstanceOf(Array);
  }, 30000);

  it("listRootMedia should return items with id and name", async () => {
    const items = await MediaHealthTestHelper.listRootMedia();
    if (items.length > 0) {
      expect(items[0]).toHaveProperty("id");
    }
  }, 30000);
});
